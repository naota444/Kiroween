import {
  PARTICIPANT_COLORS,
  PARTICIPANT_ICONS,
  ROOM_RETENTION_MS,
  type ConnectionState,
  type Participant,
  type Room,
  type StoredDrawing,
} from '@doodle-nearby/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildAddParticipantUpdate,
  buildAppendDrawingUpdate,
  buildRemoveParticipantUpdate,
  classifyAddParticipantFailure,
  codeLockToItem,
  connectionKey,
  connectionToItem,
  connectionTtl,
  drawingKey,
  drawingToItem,
  identityToken,
  itemToConnection,
  itemToDrawing,
  itemToRoom,
  padSeq,
  roomKey,
  roomToItem,
  roomTtl,
  type UpdateParts,
} from './dynamo-keys.js';
import { CONNECTION_TTL_SECONDS, TTL_MARGIN_SECONDS } from './ttl-constants.js';

const NUM_RUNS = 200;

// ---------- ジェネレーター ----------

/** 接続 ID は英数字だけ */
const connectionIdArb = fc.stringMatching(/^[A-Za-z0-9]{1,12}$/);
const roomIdArb = fc.uuid();
const geohashArb = fc.option(fc.stringMatching(/^[0-9b-hjkmnp-z]{6}$/), { nil: null });
const identityArb = fc.record({
  color: fc.constantFrom(...PARTICIPANT_COLORS),
  icon: fc.constantFrom(...PARTICIPANT_ICONS),
});
// joinedAt を狭い範囲にして、同じ値(並びの同点)をよく起こす
const participantsArb: fc.Arbitrary<Participant[]> = fc
  .uniqueArray(connectionIdArb, { minLength: 0, maxLength: 8 })
  .chain((ids) =>
    fc
      .tuple(
        fc.uniqueArray(identityArb, {
          minLength: ids.length,
          maxLength: ids.length,
          selector: identityToken,
        }),
        fc.array(fc.integer({ min: 0, max: 5 }), {
          minLength: ids.length,
          maxLength: ids.length,
        }),
      )
      .map(([identities, joinedAts]) =>
        ids.map((connectionId, i) => ({
          connectionId,
          identity: identities[i] as Participant['identity'],
          joinedAt: 1_700_000_000_000 + (joinedAts[i] ?? 0),
        })),
      ),
  );
const roomArb: fc.Arbitrary<Room> = fc
  .record({
    roomId: roomIdArb,
    roomCode: fc.stringMatching(/^[0-9]{4}$/),
    geohash: geohashArb,
    createdAt: fc.integer({ min: 0, max: 4_000_000_000_000 }),
    participants: participantsArb,
  })
  .map(({ createdAt, ...rest }) => ({
    ...rest,
    createdAt,
    expiresAt: createdAt + ROOM_RETENTION_MS,
  }));
const drawingArb: fc.Arbitrary<StoredDrawing> = fc.record({
  drawingId: fc.uuid(),
  seq: fc.integer({ min: 1, max: 1_000_000 }),
  sender: identityArb,
  image: fc.oneof(
    fc.string().map((imageData) => ({ imageData, imageKey: null })),
    fc.string({ minLength: 1 }).map((imageKey) => ({ imageData: null, imageKey })),
  ),
  createdAt: fc.integer({ min: 0, max: 4_000_000_000_000 }),
});
const connectionStateArb: fc.Arbitrary<ConnectionState> = fc.record({
  connectionId: connectionIdArb,
  geohash: geohashArb,
  roomId: fc.option(roomIdArb, { nil: null }),
});

/** 期待値: joinedAt の昇順、同じ値なら connectionId の昇順 */
function sortedParticipants(participants: Participant[]): Participant[] {
  return [...participants].sort(
    (a, b) =>
      a.joinedAt - b.joinedAt ||
      (a.connectionId < b.connectionId ? -1 : a.connectionId > b.connectionId ? 1 : 0),
  );
}

// ---------- Property 1: 項目と値の変換はラウンドトリップする ----------

describe('Property 1: 項目と値の変換はラウンドトリップする', () => {
  it('Room(参加者 0〜8 人、geohash あり / なし)', () => {
    fc.assert(
      fc.property(roomArb, fc.integer({ min: 0, max: 1000 }), (room, nextSeq) => {
        const restored = itemToRoom(roomToItem(room, nextSeq));
        expect(restored).toEqual({ ...room, participants: sortedParticipants(room.participants) });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('Room の参加者の並びは、入力の順に依らず joinedAt、connectionId の昇順', () => {
    fc.assert(
      fc.property(roomArb, fc.integer(), (room, salt) => {
        const rotated = room.participants.length
          ? [
              ...room.participants.slice(Math.abs(salt) % room.participants.length),
              ...room.participants.slice(0, Math.abs(salt) % room.participants.length),
            ]
          : [];
        const a = itemToRoom(roomToItem(room, 0)).participants;
        const b = itemToRoom(roomToItem({ ...room, participants: rotated }, 0)).participants;
        expect(b).toEqual(a);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('StoredDrawing(imageData / imageKey のどちらか)', () => {
    fc.assert(
      fc.property(
        roomIdArb,
        drawingArb,
        fc.integer({ min: 0, max: 5_000_000_000 }),
        (roomId, drawing, ttl) => {
          const item = drawingToItem(roomId, drawing, ttl);
          expect(itemToDrawing(item)).toEqual(drawing);
          expect(item.ttl).toBe(ttl);
          // imageData と imageKey のどちらか一方だけを持つ
          expect(Number(item.imageData !== undefined) + Number(item.imageKey !== undefined)).toBe(
            1,
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('ConnectionState', () => {
    fc.assert(
      fc.property(
        connectionStateArb,
        fc.integer({ min: 0, max: 4_000_000_000_000 }),
        (state, now) => {
          expect(itemToConnection(connectionToItem(state, now))).toEqual(state);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------- Property 2: TTL の範囲 ----------

describe('Property 2: TTL の範囲', () => {
  it('部屋・絵・予約: expiresAt/1000 以上、+ TTL_MARGIN_SECONDS + 1 以下', () => {
    fc.assert(
      fc.property(roomArb, (room) => {
        const seconds = room.expiresAt / 1000;
        const ttls = [roomToItem(room, 0).ttl, codeLockToItem(room).ttl, roomTtl(room.expiresAt)];
        for (const ttl of ttls) {
          expect(ttl).toBeGreaterThanOrEqual(seconds);
          expect(ttl).toBeLessThanOrEqual(seconds + TTL_MARGIN_SECONDS + 1);
          expect(Number.isInteger(ttl)).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('接続状態: now/1000 より大きく、+ CONNECTION_TTL_SECONDS 以下', () => {
    fc.assert(
      fc.property(
        connectionStateArb,
        fc.integer({ min: 0, max: 4_000_000_000_000 }),
        (state, now) => {
          const ttl = connectionToItem(state, now).ttl;
          expect(ttl).toBeGreaterThan(now / 1000);
          expect(ttl).toBeLessThanOrEqual(now / 1000 + CONNECTION_TTL_SECONDS);
          expect(ttl).toBe(connectionTtl(now));
          expect(Number.isInteger(ttl)).toBe(true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('端数のある expiresAt は切り上げる', () => {
    expect(roomTtl(1_000_001)).toBe(1001 + TTL_MARGIN_SECONDS);
    expect(roomTtl(1_000_000)).toBe(1000 + TTL_MARGIN_SECONDS);
    expect(connectionTtl(1_999)).toBe(1 + CONNECTION_TTL_SECONDS);
  });
});

// ---------- 接続の GSI キー(スパース) ----------

describe('接続状態の GSI キー', () => {
  const now = 1_700_000_000_000;
  const cases: Array<{
    name: string;
    geohash: string | null;
    roomId: string | null;
    gsi: boolean;
  }> = [
    { name: 'geohash あり、roomId なし', geohash: 'xn774c', roomId: null, gsi: true },
    { name: 'geohash あり、roomId あり', geohash: 'xn774c', roomId: 'r1', gsi: false },
    { name: 'geohash なし、roomId なし', geohash: null, roomId: null, gsi: false },
    { name: 'geohash なし、roomId あり', geohash: null, roomId: 'r1', gsi: false },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const item = connectionToItem(
        { connectionId: 'abc', geohash: c.geohash, roomId: c.roomId },
        now,
      );
      if (c.gsi) {
        expect(item.gsi1pk).toBe('GEO#xn774c');
        expect(item.gsi1sk).toBe('CONN#abc');
      } else {
        expect(item).not.toHaveProperty('gsi1pk');
        expect(item).not.toHaveProperty('gsi1sk');
      }
      expect(item.pk).toBe('CONN#abc');
      expect(item.sk).toBe('STATE');
      // null の属性は項目に含めない
      expect(item.geohash === undefined).toBe(c.geohash === null);
      expect(item.roomId === undefined).toBe(c.roomId === null);
    });
  }
});

// ---------- 項目の形 ----------

describe('部屋の項目', () => {
  const base: Room = {
    roomId: 'room1',
    roomCode: '1234',
    geohash: 'xn774c',
    createdAt: 1000,
    expiresAt: 1000 + ROOM_RETENTION_MS,
    participants: [],
  };

  it('参加者が 0 人なら identities を省略し、participants は空の Map', () => {
    const item = roomToItem(base, 0);
    expect(item).not.toHaveProperty('identities');
    expect(item.participants).toEqual({});
    expect(item.nextSeq).toBe(0);
  });

  it('参加者がいれば identities は color:icon の Set', () => {
    const item = roomToItem(
      {
        ...base,
        participants: [
          { connectionId: 'a', identity: { color: 'red', icon: 'cat' }, joinedAt: 1 },
          { connectionId: 'b', identity: { color: 'blue', icon: 'dog' }, joinedAt: 2 },
        ],
      },
      0,
    );
    expect(item.identities).toEqual(new Set(['red:cat', 'blue:dog']));
  });

  it('geohash があれば GSI キーを付け、位置なしなら geohash と GSI キーを省略する', () => {
    const withGeo = roomToItem(base, 0);
    expect(withGeo.geohash).toBe('xn774c');
    expect(withGeo.gsi1pk).toBe('GEO#xn774c');
    expect(withGeo.gsi1sk).toBe('ROOM#room1');
    const noGeo = roomToItem({ ...base, geohash: null }, 0);
    expect(noGeo).not.toHaveProperty('geohash');
    expect(noGeo).not.toHaveProperty('gsi1pk');
    expect(noGeo).not.toHaveProperty('gsi1sk');
  });

  it('緯度経度・IP・名前の属性を持たない', () => {
    const keys = Object.keys(roomToItem(base, 0));
    for (const forbidden of ['lat', 'lng', 'latitude', 'longitude', 'ip', 'name']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('キーは ROOM#<id> / META、予約は CODE#<code> / LOCK', () => {
    expect(roomKey('r')).toEqual({ pk: 'ROOM#r', sk: 'META' });
    expect(codeLockToItem(base)).toMatchObject({ pk: 'CODE#1234', sk: 'LOCK', roomId: 'room1' });
    expect(connectionKey('c')).toEqual({ pk: 'CONN#c', sk: 'STATE' });
  });

  it('同じ joinedAt の参加者は connectionId の昇順', () => {
    const room: Room = {
      ...base,
      participants: [
        { connectionId: 'b', identity: { color: 'red', icon: 'cat' }, joinedAt: 5 },
        { connectionId: 'a', identity: { color: 'blue', icon: 'dog' }, joinedAt: 5 },
        { connectionId: 'c', identity: { color: 'green', icon: 'bear' }, joinedAt: 1 },
      ],
    };
    expect(itemToRoom(roomToItem(room, 0)).participants.map((p) => p.connectionId)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });
});

describe('padSeq と絵のキー', () => {
  it('10 桁のゼロ埋め', () => {
    expect(padSeq(1)).toBe('0000000001');
    expect(padSeq(0)).toBe('0000000000');
    expect(padSeq(9_999_999_999)).toBe('9999999999');
    expect(drawingKey('r', 12)).toEqual({ pk: 'ROOM#r', sk: 'DRAWING#0000000012' });
  });

  it('範囲外・整数でない値は RangeError', () => {
    expect(() => padSeq(-1)).toThrow(RangeError);
    expect(() => padSeq(1.5)).toThrow(RangeError);
    expect(() => padSeq(10_000_000_000)).toThrow(RangeError);
    expect(() => padSeq(Number.NaN)).toThrow(RangeError);
  });

  it('sk の辞書順は seq の順と一致する', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 9_999_999_999 }),
        fc.integer({ min: 0, max: 9_999_999_999 }),
        (a, b) => {
          expect(padSeq(a) < padSeq(b)).toBe(a < b);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------- UpdateItem の式 ----------

function usedNames(parts: UpdateParts): string[] {
  const text = `${parts.UpdateExpression} ${parts.ConditionExpression}`;
  return [...new Set(text.match(/#[A-Za-z]\w*/g) ?? [])].sort();
}

function usedValues(parts: UpdateParts): string[] {
  const text = `${parts.UpdateExpression} ${parts.ConditionExpression}`;
  return [...new Set(text.match(/:[A-Za-z]\w*/g) ?? [])].sort();
}

describe('UpdateItem の式', () => {
  const participant: Participant = {
    connectionId: 'abc123',
    identity: { color: 'red', icon: 'cat' },
    joinedAt: 42,
  };

  it('addParticipant: 式と属性名・値が過不足なく対応する', () => {
    const parts = buildAddParticipantUpdate(participant, 8);
    expect(Object.keys(parts.ExpressionAttributeNames).sort()).toEqual(usedNames(parts));
    expect(Object.keys(parts.ExpressionAttributeValues).sort()).toEqual(usedValues(parts));
    expect(parts.ExpressionAttributeNames).toEqual({
      '#pk': 'pk',
      '#participants': 'participants',
      '#identities': 'identities',
      '#c': 'abc123',
    });
    expect(parts.ExpressionAttributeValues).toEqual({
      ':p': { color: 'red', icon: 'cat', joinedAt: 42 },
      ':idset': new Set(['red:cat']),
      ':id': 'red:cat',
      ':max': 8,
    });
  });

  it('removeParticipant: 式と属性名・値が過不足なく対応する', () => {
    const parts = buildRemoveParticipantUpdate('abc123', { color: 'red', icon: 'cat' });
    expect(Object.keys(parts.ExpressionAttributeNames).sort()).toEqual(usedNames(parts));
    expect(Object.keys(parts.ExpressionAttributeValues).sort()).toEqual(usedValues(parts));
    expect(parts.ExpressionAttributeValues).toEqual({ ':idset': new Set(['red:cat']) });
    expect(parts.ConditionExpression).toBe('attribute_exists(#participants.#c)');
  });

  it('appendDrawing: 式と属性名・値が過不足なく対応する', () => {
    const parts = buildAppendDrawingUpdate();
    expect(Object.keys(parts.ExpressionAttributeNames).sort()).toEqual(usedNames(parts));
    expect(Object.keys(parts.ExpressionAttributeValues).sort()).toEqual(usedValues(parts));
    expect(parts.UpdateExpression).toBe('ADD #nextSeq :one');
    expect(parts.ExpressionAttributeValues).toEqual({ ':one': 1 });
  });

  it('接続 ID は式に現れず、#c の値としてだけ渡る', () => {
    fc.assert(
      fc.property(connectionIdArb, (connectionId) => {
        const add = buildAddParticipantUpdate({ ...participant, connectionId }, 8);
        const remove = buildRemoveParticipantUpdate(connectionId, participant.identity);
        for (const parts of [add, remove]) {
          expect(parts.ExpressionAttributeNames['#c']).toBe(connectionId);
          expect(
            Object.values(parts.ExpressionAttributeNames).filter((v) => v === connectionId),
          ).toHaveLength(1);
        }
      }),
      { numRuns: NUM_RUNS },
    );
    // 式の記号を含む接続 ID でも、式の文字列は変わらない
    const odd = buildAddParticipantUpdate({ ...participant, connectionId: 'a.b#c:d =' }, 8);
    const plain = buildAddParticipantUpdate(participant, 8);
    expect(odd.UpdateExpression).toBe(plain.UpdateExpression);
    expect(odd.ConditionExpression).toBe(plain.ConditionExpression);
  });

  it('予約語 ttl を式に直接書かない', () => {
    const all = [
      buildAddParticipantUpdate(participant, 8),
      buildRemoveParticipantUpdate('c', participant.identity),
      buildAppendDrawingUpdate(),
    ];
    for (const parts of all) {
      expect(`${parts.UpdateExpression} ${parts.ConditionExpression}`).not.toMatch(
        /(^|[^#\w])ttl\b/,
      );
    }
  });
});

// ---------- addParticipant の失敗理由 ----------

describe('classifyAddParticipantFailure', () => {
  const joined: Participant = {
    connectionId: 'a',
    identity: { color: 'red', icon: 'cat' },
    joinedAt: 1,
  };
  const room: Room = {
    roomId: 'room1',
    roomCode: '1234',
    geohash: null,
    createdAt: 0,
    expiresAt: ROOM_RETENTION_MS,
    participants: [joined],
  };
  const item = roomToItem(room, 0);

  it('項目がなければ not_found', () => {
    expect(classifyAddParticipantFailure(undefined, joined, 8)).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('すでに参加していれば、変更なしで成功(added: false)', () => {
    expect(classifyAddParticipantFailure(item, joined, 8)).toEqual({
      ok: true,
      room,
      added: false,
    });
  });

  it('満員なら full', () => {
    const other: Participant = {
      connectionId: 'b',
      identity: { color: 'blue', icon: 'dog' },
      joinedAt: 2,
    };
    expect(classifyAddParticipantFailure(item, other, 1)).toEqual({ ok: false, reason: 'full' });
  });

  it('同じ識別がいれば identity_taken', () => {
    const other: Participant = {
      connectionId: 'b',
      identity: { color: 'red', icon: 'cat' },
      joinedAt: 2,
    };
    expect(classifyAddParticipantFailure(item, other, 8)).toEqual({
      ok: false,
      reason: 'identity_taken',
    });
  });

  it('すでに参加していて満員でも、added: false の成功が先', () => {
    expect(classifyAddParticipantFailure(item, joined, 1)).toMatchObject({
      ok: true,
      added: false,
    });
  });

  it('満員と識別の重複が重なれば full が先(MemoryRoomStore と同じ)', () => {
    const other: Participant = {
      connectionId: 'b',
      identity: { color: 'red', icon: 'cat' },
      joinedAt: 2,
    };
    expect(classifyAddParticipantFailure(item, other, 1)).toEqual({ ok: false, reason: 'full' });
  });
});
