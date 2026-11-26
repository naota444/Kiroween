/**
 * RoomStore の契約テスト。MemoryRoomStore と、将来の DynamoDbRoomStore(aws-deploy Spec)で同じケースを実行する。
 *
 * describe / it / expect は 'vitest' から直接 import する(引数では受け取らない)。
 * vitest はモノレポの devDependency なので、テスト側から '@doodle-nearby/core/testing' を import する
 * 利用者は vitest が入っている前提でよい。このファイルは本体の index.ts からは export しない。
 *
 * 前提: createStore() は呼ぶたびに空のストアを返す(DynamoDB ならテストごとに別のテーブルか接頭辞)。
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_PARTICIPANTS,
  PARTICIPANT_COLORS,
  PARTICIPANT_ICONS,
  type ParticipantIdentity,
} from '../messages.js';
import type { NewDrawing, RoomStore } from '../room-store.js';
import type { Participant, Room } from '../room-types.js';

export type CreateRoomStore = () => RoomStore | Promise<RoomStore>;

const room = (over: Partial<Room> = {}): Room => ({
  roomId: 'r1',
  roomCode: '1234',
  geohash: 'xn76ur',
  createdAt: 0,
  expiresAt: 1000,
  participants: [],
  ...over,
});

const identityAt = (n: number): ParticipantIdentity => ({
  color: PARTICIPANT_COLORS[n % PARTICIPANT_COLORS.length] as ParticipantIdentity['color'],
  icon: PARTICIPANT_ICONS[
    Math.floor(n / PARTICIPANT_COLORS.length) % PARTICIPANT_ICONS.length
  ] as ParticipantIdentity['icon'],
});

/** n 番目の参加者。n が違えば connectionId も識別も必ず違う(96 通りまで) */
const person = (n: number): Participant => ({
  connectionId: `c${n}`,
  identity: identityAt(n),
  joinedAt: n,
});

const drawing = (n: number): NewDrawing => ({
  drawingId: `d${n}`,
  sender: { color: 'red', icon: 'cat' },
  image: { imageData: 'AAAA', imageKey: null },
  createdAt: n,
});

export function runRoomStoreContract(name: string, createStore: CreateRoomStore): void {
  describe(`RoomStore contract: ${name}`, () => {
    describe('createRoom / get', () => {
      it('gets a created room by id and by code, and returns null for unknown keys', async () => {
        const store = await createStore();
        expect(await store.createRoom(room(), 0)).toEqual({ ok: true });
        expect(await store.getRoomById('r1')).toEqual(room());
        expect(await store.getRoomByCode('1234')).toEqual(room());
        expect(await store.getRoomById('nope')).toBeNull();
        expect(await store.getRoomByCode('9999')).toBeNull();
      });

      it('returns code_taken for a live room with the same code and keeps the original', async () => {
        const store = await createStore();
        await store.createRoom(room(), 0);
        expect(await store.createRoom(room({ roomId: 'r2' }), 999)).toEqual({
          ok: false,
          reason: 'code_taken',
        });
        expect(await store.getRoomById('r2')).toBeNull();
        expect((await store.getRoomByCode('1234'))?.roomId).toBe('r1');
      });

      it('replaces an expired room with the same code, dropping its drawings', async () => {
        const store = await createStore();
        await store.createRoom(room(), 0);
        await store.appendDrawing('r1', drawing(1), 50);
        expect(await store.createRoom(room({ roomId: 'r2', expiresAt: 5000 }), 1000)).toEqual({
          ok: true,
        });
        expect(await store.getRoomById('r1')).toBeNull();
        expect(await store.listDrawings('r1')).toEqual([]);
        expect((await store.getRoomByCode('1234'))?.roomId).toBe('r2');
      });
    });

    describe('listRoomsByGeohashes', () => {
      it('returns rooms in any of 1 to 9 cells, never rooms without a geohash', async () => {
        const store = await createStore();
        const cells = ['xn76ur', 'xn76us', 'xn76ut', 'xn76uu', 'xn76uv', 'xn76uw', 'xn76ux'];
        for (const [i, geohash] of cells.entries()) {
          await store.createRoom(room({ roomId: `g${i}`, roomCode: String(1000 + i), geohash }), 0);
        }
        await store.createRoom(room({ roomId: 'none', roomCode: '2000', geohash: null }), 0);

        const ids = async (hashes: string[]) =>
          (await store.listRoomsByGeohashes(hashes)).map((r) => r.roomId).sort();
        expect(await ids(['xn76ur'])).toEqual(['g0']);
        expect(await ids(['xn76ur', 'xn76ut', 'zzzzzz'])).toEqual(['g0', 'g2']);
        expect(await ids(cells.concat(['bbbbbb', 'cccccc']))).toEqual(
          cells.map((_, i) => `g${i}`).sort(),
        );
        expect(await ids(['zzzzzz'])).toEqual([]);
      });
    });

    describe('listActiveRoomCodes', () => {
      it('lists only codes of rooms that have not expired', async () => {
        const store = await createStore();
        await store.createRoom(room({ roomId: 'a', roomCode: '1111', expiresAt: 100 }), 0);
        await store.createRoom(room({ roomId: 'b', roomCode: '2222', expiresAt: 200 }), 0);
        expect((await store.listActiveRoomCodes(50)).sort()).toEqual(['1111', '2222']);
        expect(await store.listActiveRoomCodes(100)).toEqual(['2222']);
        expect(await store.listActiveRoomCodes(200)).toEqual([]);
      });
    });

    describe('addParticipant', () => {
      it('adds a participant and returns the updated room', async () => {
        const store = await createStore();
        await store.createRoom(room(), 0);
        const result = await store.addParticipant('r1', person(0), MAX_PARTICIPANTS);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.added).toBe(true);
          expect(result.room.participants).toEqual([person(0)]);
        }
        expect((await store.getRoomById('r1'))?.participants).toEqual([person(0)]);
      });

      it('returns not_found for an unknown room', async () => {
        const store = await createStore();
        expect(await store.addParticipant('nope', person(0), MAX_PARTICIPANTS)).toEqual({
          ok: false,
          reason: 'not_found',
        });
      });

      it('is idempotent for the same connectionId (added=false, no change)', async () => {
        const store = await createStore();
        await store.createRoom(room(), 0);
        await store.addParticipant('r1', person(0), MAX_PARTICIPANTS);
        const again = await store.addParticipant(
          'r1',
          { ...person(0), identity: identityAt(5) },
          MAX_PARTICIPANTS,
        );
        expect(again.ok).toBe(true);
        if (again.ok) {
          expect(again.added).toBe(false);
          expect(again.room.participants).toEqual([person(0)]);
        }
      });

      it('returns full at capacity and leaves the room unchanged', async () => {
        const store = await createStore();
        await store.createRoom(room(), 0);
        for (let i = 0; i < 3; i += 1) await store.addParticipant('r1', person(i), 3);
        expect(await store.addParticipant('r1', person(3), 3)).toEqual({
          ok: false,
          reason: 'full',
        });
        expect((await store.getRoomById('r1'))?.participants).toHaveLength(3);
      });

      it('returns identity_taken when another connection has the same color and icon', async () => {
        const store = await createStore();
        await store.createRoom(room(), 0);
        await store.addParticipant('r1', person(0), MAX_PARTICIPANTS);
        const clash: Participant = { ...person(1), identity: person(0).identity };
        expect(await store.addParticipant('r1', clash, MAX_PARTICIPANTS)).toEqual({
          ok: false,
          reason: 'identity_taken',
        });
        expect((await store.getRoomById('r1'))?.participants).toHaveLength(1);
      });
    });

    describe('removeParticipant', () => {
      it('removes the participant and returns the updated room', async () => {
        const store = await createStore();
        await store.createRoom(room(), 0);
        await store.addParticipant('r1', person(0), MAX_PARTICIPANTS);
        await store.addParticipant('r1', person(1), MAX_PARTICIPANTS);
        const updated = await store.removeParticipant('r1', 'c0');
        expect(updated?.participants).toEqual([person(1)]);
        expect((await store.getRoomById('r1'))?.participants).toEqual([person(1)]);
      });

      it('does not fail for a non-participant, and returns null for an unknown room', async () => {
        const store = await createStore();
        await store.createRoom(room(), 0);
        await store.addParticipant('r1', person(0), MAX_PARTICIPANTS);
        expect((await store.removeParticipant('r1', 'ghost'))?.participants).toEqual([person(0)]);
        expect(await store.removeParticipant('nope', 'c0')).toBeNull();
      });

      it('frees the identity for a later participant', async () => {
        const store = await createStore();
        await store.createRoom(room(), 0);
        await store.addParticipant('r1', person(0), MAX_PARTICIPANTS);
        await store.removeParticipant('r1', 'c0');
        const reuse: Participant = { ...person(1), identity: person(0).identity };
        const result = await store.addParticipant('r1', reuse, MAX_PARTICIPANTS);
        expect(result.ok).toBe(true);
      });
    });

    describe('appendDrawing / listDrawings', () => {
      it('assigns seq from 1 in order and lists oldest first', async () => {
        const store = await createStore();
        await store.createRoom(room(), 0);
        for (let i = 1; i <= 3; i += 1) {
          const r = await store.appendDrawing('r1', drawing(i), 50);
          expect(r.ok && r.drawing).toEqual({ ...drawing(i), seq: i });
        }
        const listed = await store.listDrawings('r1');
        expect(listed.map((d) => d.seq)).toEqual([1, 2, 3]);
        expect(listed.map((d) => d.drawingId)).toEqual(['d1', 'd2', 'd3']);
      });

      it('keeps only the newest maxDrawings and keeps seq increasing', async () => {
        const store = await createStore();
        await store.createRoom(room(), 0);
        for (let i = 1; i <= 5; i += 1) await store.appendDrawing('r1', drawing(i), 3);
        expect((await store.listDrawings('r1')).map((d) => d.seq)).toEqual([3, 4, 5]);
        const next = await store.appendDrawing('r1', drawing(6), 3);
        expect(next.ok && next.drawing.seq).toBe(6);
      });

      it('keeps seq independent per room', async () => {
        const store = await createStore();
        await store.createRoom(room(), 0);
        await store.createRoom(room({ roomId: 'r2', roomCode: '5678' }), 0);
        await store.appendDrawing('r1', drawing(1), 50);
        const other = await store.appendDrawing('r2', drawing(2), 50);
        expect(other.ok && other.drawing.seq).toBe(1);
        expect(await store.listDrawings('r1')).toHaveLength(1);
      });

      it('returns not_found for appending to an unknown room, and [] when listing one', async () => {
        const store = await createStore();
        expect(await store.appendDrawing('nope', drawing(1), 50)).toEqual({
          ok: false,
          reason: 'not_found',
        });
        expect(await store.listDrawings('nope')).toEqual([]);
      });

      it('stores imageKey drawings as given', async () => {
        const store = await createStore();
        await store.createRoom(room(), 0);
        const keyed: NewDrawing = { ...drawing(1), image: { imageData: null, imageKey: 'k1' } };
        await store.appendDrawing('r1', keyed, 50);
        expect((await store.listDrawings('r1'))[0]?.image).toEqual({
          imageData: null,
          imageKey: 'k1',
        });
      });
    });

    describe('deleteExpired', () => {
      it('deletes rooms with expiresAt <= now, with their drawings, and reports them', async () => {
        const store = await createStore();
        await store.createRoom(room({ roomId: 'old', roomCode: '1111', expiresAt: 100 }), 0);
        await store.createRoom(
          room({ roomId: 'nogeo', roomCode: '2222', geohash: null, expiresAt: 100 }),
          0,
        );
        await store.createRoom(room({ roomId: 'live', roomCode: '3333', expiresAt: 200 }), 0);
        await store.appendDrawing('old', drawing(1), 50);

        expect(await store.deleteExpired(99)).toEqual([]);
        const deleted = await store.deleteExpired(100);
        expect(deleted.sort((a, b) => a.roomId.localeCompare(b.roomId))).toEqual([
          { roomId: 'nogeo', geohash: null },
          { roomId: 'old', geohash: 'xn76ur' },
        ]);
        expect(await store.getRoomById('old')).toBeNull();
        expect(await store.getRoomByCode('1111')).toBeNull();
        expect(await store.listDrawings('old')).toEqual([]);
        expect((await store.getRoomById('live'))?.roomId).toBe('live');
      });

      it('lets the room code be reused after deletion', async () => {
        const store = await createStore();
        await store.createRoom(room(), 0);
        await store.deleteExpired(1000);
        expect(await store.createRoom(room({ roomId: 'r9', expiresAt: 5000 }), 1000)).toEqual({
          ok: true,
        });
        expect((await store.getRoomByCode('1234'))?.roomId).toBe('r9');
      });
    });

    // Feature: local-prototype, Property 12: RoomStore はモデルと同じ結果を返す
    // **Validates: Requirements 10.3, 10.10, 13.5**
    describe('model equivalence', () => {
      type Op = { kind: 'add'; n: number } | { kind: 'remove'; n: number } | { kind: 'draw' };
      const opArb = fc.oneof(
        fc.record({ kind: fc.constant('add' as const), n: fc.integer({ min: 0, max: 5 }) }),
        fc.record({ kind: fc.constant('remove' as const), n: fc.integer({ min: 0, max: 5 }) }),
        fc.record({ kind: fc.constant('draw' as const) }),
      );

      it('matches a simple in-memory model for add / remove / append sequences', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(opArb, { maxLength: 30 }),
            fc.integer({ min: 1, max: 4 }),
            async (ops: Op[], maxDrawings) => {
              const capacity = 3;
              const store = await createStore();
              await store.createRoom(room(), 0);
              let members: Participant[] = [];
              let seqs: number[] = [];
              let nextSeq = 1;
              for (const op of ops) {
                if (op.kind === 'add') {
                  const p = person(op.n);
                  const result = await store.addParticipant('r1', p, capacity);
                  if (members.some((m) => m.connectionId === p.connectionId)) {
                    expect(result.ok && !result.added).toBe(true);
                  } else if (members.length >= capacity) {
                    expect(result).toEqual({ ok: false, reason: 'full' });
                  } else {
                    expect(result.ok && result.added).toBe(true);
                    members = [...members, p];
                  }
                } else if (op.kind === 'remove') {
                  await store.removeParticipant('r1', `c${op.n}`);
                  members = members.filter((m) => m.connectionId !== `c${op.n}`);
                } else {
                  const r = await store.appendDrawing('r1', drawing(nextSeq), maxDrawings);
                  expect(r.ok && r.drawing.seq).toBe(nextSeq);
                  seqs = [...seqs, nextSeq].slice(-maxDrawings);
                  nextSeq += 1;
                }
              }
              const got = await store.getRoomById('r1');
              expect(got?.participants.map((p) => p.connectionId).sort()).toEqual(
                members.map((m) => m.connectionId).sort(),
              );
              expect((await store.listDrawings('r1')).map((d) => d.seq)).toEqual(seqs);
            },
          ),
          { numRuns: 100 },
        );
      });
    });
  });
}
