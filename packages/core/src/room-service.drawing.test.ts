import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MemoryRoomStore } from './memory-room-store.js';
import { MAX_IMAGE_DATA_CHARS, type ClientMessage } from './messages.js';
import { RoomService } from './room-service.js';
import type { ConnectionState } from './room-types.js';
import { createFakePorts, simpleOrderRooms } from './testing/room-service-fixture.js';

const none = (id: string): ConnectionState => ({ connectionId: id, geohash: null, roomId: null });

async function setup(options: { acceptImageKey?: boolean; maxDrawings?: number } = {}) {
  const store = new MemoryRoomStore();
  const ports = createFakePorts();
  let n = 0;
  const service = new RoomService({
    store,
    ports,
    orderRooms: simpleOrderRooms,
    newId: () => `id-${(n += 1)}`,
    ...options,
  });
  let a = await service.handleMessage(none('a'), { type: 'create_room', geohash: null });
  const roomId = a.roomId ?? '';
  const code = (await store.getRoomById(roomId))?.roomCode ?? '';
  let b = await service.handleMessage(none('b'), { type: 'join_by_code', roomCode: code });
  a = { ...a };
  b = { ...b };
  ports.clear();
  return { service, ports, store, roomId, a, b };
}

const submit = (roomId: string, imageData = 'AAAA'): ClientMessage => ({
  type: 'drawing_submit',
  roomId,
  imageData,
  imageKey: null,
});

describe('drawing submit', () => {
  it('stores and sends drawing_added to every participant including the sender', async () => {
    const { service, ports, store, roomId, a } = await setup();
    await service.handleMessage(a, submit(roomId));
    for (const id of ['a', 'b']) {
      const msgs = ports.messagesTo(id);
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toMatchObject({
        type: 'drawing_added',
        roomId,
        seq: 1,
        imageData: 'AAAA',
        imageKey: null,
      });
    }
    expect(await store.listDrawings(roomId)).toHaveLength(1);
  });

  it('keeps at most maxDrawings, dropping the oldest', async () => {
    const { service, store, roomId, a } = await setup({ maxDrawings: 2 });
    for (let i = 0; i < 3; i += 1) await service.handleMessage(a, submit(roomId));
    expect((await store.listDrawings(roomId)).map((d) => d.seq)).toEqual([2, 3]);
  });

  it('rejects unknown room, non-participant, imageKey, and oversize data to the sender only', async () => {
    const { service, ports, store, roomId, a } = await setup();
    const outsider = none('z');
    const cases: [ConnectionState, ClientMessage, string][] = [
      [a, submit('nope'), 'room_not_found'],
      [outsider, submit(roomId), 'invalid_field'],
      [a, { type: 'drawing_submit', roomId, imageData: null, imageKey: 'k' }, 'invalid_field'],
      [a, submit(roomId, 'A'.repeat(MAX_IMAGE_DATA_CHARS + 1)), 'message_too_large'],
    ];
    for (const [state, message, code] of cases) {
      ports.clear();
      await service.handleMessage(state, message);
      expect(ports.messagesTo(state.connectionId)).toMatchObject([{ type: 'error', code }]);
      expect(ports.messagesTo('b')).toEqual([]);
    }
    expect(await store.listDrawings(roomId)).toEqual([]);
  });

  it('accepts imageKey when acceptImageKey is true', async () => {
    const { service, ports, roomId, a } = await setup({ acceptImageKey: true });
    await service.handleMessage(a, {
      type: 'drawing_submit',
      roomId,
      imageData: null,
      imageKey: 'k1',
    });
    expect(ports.messagesTo('b')).toMatchObject([{ type: 'drawing_added', imageKey: 'k1' }]);
  });
});

/** 複数の部屋を作り、各部屋に参加者を置く。 */
async function setupRooms(sizes: number[]) {
  const store = new MemoryRoomStore();
  const ports = createFakePorts();
  let n = 0;
  const service = new RoomService({
    store,
    ports,
    orderRooms: simpleOrderRooms,
    newId: () => `id-${(n += 1)}`,
  });
  const rooms: { roomId: string; members: ConnectionState[] }[] = [];
  for (const [r, size] of sizes.entries()) {
    const owner = await service.handleMessage(none(`r${r}p0`), {
      type: 'create_room',
      geohash: null,
    });
    const roomId = owner.roomId ?? '';
    const code = (await store.getRoomById(roomId))?.roomCode ?? '';
    const members = [owner];
    for (let i = 1; i < size; i += 1) {
      members.push(
        await service.handleMessage(none(`r${r}p${i}`), { type: 'join_by_code', roomCode: code }),
      );
    }
    rooms.push({ roomId, members });
  }
  ports.clear();
  return { service, ports, store, rooms };
}

describe('drawing distribution across rooms', () => {
  it('reaches everyone in the sender room exactly once and nobody in the other room', async () => {
    const { service, ports, store, rooms } = await setupRooms([2, 2]);
    const [r0, r1] = rooms;
    await service.handleMessage(r0!.members[0]!, submit(r0!.roomId));
    for (const m of r0!.members) {
      expect(ports.messagesTo(m.connectionId)).toMatchObject([
        { type: 'drawing_added', roomId: r0!.roomId },
      ]);
    }
    for (const m of r1!.members) expect(ports.messagesTo(m.connectionId)).toEqual([]);
    expect(await store.listDrawings(r1!.roomId)).toEqual([]);
  });

  it('sends room_not_found and invalid_field only to the sender, storing and distributing nothing', async () => {
    const { service, ports, store, rooms } = await setupRooms([2, 1]);
    const [r0, r1] = rooms;
    const outsider = r1!.members[0]!;
    for (const [state, roomId, code] of [
      [r0!.members[0]!, 'missing', 'room_not_found'],
      [outsider, r0!.roomId, 'invalid_field'],
    ] as const) {
      ports.clear();
      await service.handleMessage(state, submit(roomId));
      expect(ports.sent).toHaveLength(1);
      expect(ports.messagesTo(state.connectionId)).toMatchObject([{ type: 'error', code }]);
    }
    expect(await store.listDrawings(r0!.roomId)).toEqual([]);
    expect(await store.listDrawings(r1!.roomId)).toEqual([]);
  });

  // Feature: local-prototype, Property 15: 絵の配布先
  // **Validates: Requirements 9.1, 9.3, 9.4, 13.1**
  it('Property 15: drawing_added goes to exactly the sender room participants once', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 3 }), { minLength: 2, maxLength: 3 }),
        fc.nat(),
        fc.nat(),
        async (sizes, roomPick, memberPick) => {
          const { service, ports, store, rooms } = await setupRooms(sizes);
          const target = rooms[roomPick % rooms.length]!;
          const sender = target.members[memberPick % target.members.length]!;
          await service.handleMessage(sender, submit(target.roomId));
          for (const room of rooms) {
            for (const m of room.members) {
              const got = ports.messagesTo(m.connectionId);
              if (room === target) {
                expect(got).toHaveLength(1);
                expect(got[0]).toMatchObject({ type: 'drawing_added', roomId: target.roomId });
              } else {
                expect(got).toEqual([]);
              }
            }
            expect(await store.listDrawings(room.roomId)).toHaveLength(room === target ? 1 : 0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
