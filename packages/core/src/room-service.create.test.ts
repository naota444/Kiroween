import { describe, expect, it } from 'vitest';
import { createManualClock } from './clock.js';
import { MemoryRoomStore } from './memory-room-store.js';
import { MAX_PARTICIPANTS, type ServerMessage } from './messages.js';
import { ROOM_RETENTION_MS } from './room-constants.js';
import { RoomService } from './room-service.js';
import type { ConnectionState } from './room-types.js';
import {
  createFakePorts,
  createSeededRandom,
  createSequentialIds,
  simpleOrderRooms,
} from './testing/room-service-fixture.js';

const START = 1_700_000_000_000;

function setup() {
  const store = new MemoryRoomStore();
  const ports = createFakePorts();
  const clock = createManualClock(START);
  const service = new RoomService({
    store,
    ports,
    orderRooms: simpleOrderRooms,
    clock,
    random: createSeededRandom(42),
    newId: createSequentialIds('room'),
  });
  return { store, ports, service };
}

function conn(n: number): ConnectionState {
  return { connectionId: `c${n}`, geohash: null, roomId: null };
}

function find<T extends ServerMessage['type']>(
  messages: ServerMessage[],
  type: T,
): Extract<ServerMessage, { type: T }> | undefined {
  return messages.find((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
}

describe('RoomService create_room', () => {
  it('creates a room with unique id, 4-digit code, geohash and expiry', async () => {
    const { store, ports, service } = setup();
    await service.handleMessage(conn(1), { type: 'create_room', geohash: 'xn76cy' });
    await service.handleMessage(conn(2), { type: 'create_room', geohash: 'xn76cy' });

    const c1 = find(ports.messagesTo('c1'), 'room_created');
    const c2 = find(ports.messagesTo('c2'), 'room_created');
    expect(c1).toBeDefined();
    expect(c2).toBeDefined();
    expect(c1?.roomId).not.toBe(c2?.roomId);
    expect(c1?.roomCode).toMatch(/^\d{4}$/);

    const room = await store.getRoomById(c1?.roomId ?? '');
    expect(room?.geohash).toBe('xn76cy');
    expect(room?.roomCode).toBe(c1?.roomCode);
    expect(room?.expiresAt).toBe((room?.createdAt ?? 0) + ROOM_RETENTION_MS);
    expect(room?.createdAt).toBe(START);
  });

  it('creates a room without a location (geohash: null)', async () => {
    const { store, ports, service } = setup();
    const next = await service.handleMessage(conn(1), { type: 'create_room', geohash: null });
    const created = find(ports.messagesTo('c1'), 'room_created');
    expect(created).toBeDefined();
    const room = await store.getRoomById(created?.roomId ?? '');
    expect(room?.geohash).toBeNull();
    expect(next.roomId).toBe(created?.roomId);
  });

  it('rejects a geohash that is not 6 characters and adds no room', async () => {
    const { store, ports, service } = setup();
    for (const geohash of ['xn76c', 'xn76cyz', '']) {
      const state = conn(1);
      const next = await service.handleMessage(state, { type: 'create_room', geohash });
      expect(next).toEqual(state);
    }
    const errors = ports.messagesTo('c1').filter((m) => m.type === 'error');
    expect(errors).toHaveLength(3);
    expect(errors.every((m) => m.type === 'error' && m.code === 'invalid_field')).toBe(true);
    expect(find(ports.messagesTo('c1'), 'room_created')).toBeUndefined();
    expect(await store.listActiveRoomCodes(START)).toEqual([]);
  });
});

describe('RoomService capacity', () => {
  it('lets 8 join, rejects the 9th with room_full, and leaves the room unchanged', async () => {
    const { store, ports, service } = setup();
    const owner = await service.handleMessage(conn(1), { type: 'create_room', geohash: 'xn76cy' });
    const roomId = owner.roomId ?? '';

    for (let i = 2; i <= MAX_PARTICIPANTS; i += 1) {
      const next = await service.handleMessage(conn(i), {
        type: 'join',
        geohash: 'xn76cy',
        roomId,
        roomCode: null,
      });
      expect(next.roomId).toBe(roomId);
    }
    const before = await store.getRoomById(roomId);
    expect(before?.participants).toHaveLength(MAX_PARTICIPANTS);

    const ninth = conn(9);
    const next = await service.handleMessage(ninth, {
      type: 'join',
      geohash: 'xn76cy',
      roomId,
      roomCode: null,
    });
    expect(next).toEqual(ninth);
    const err = find(ports.messagesTo('c9'), 'error');
    expect(err?.code).toBe('room_full');

    const after = await store.getRoomById(roomId);
    expect(after?.participants).toEqual(before?.participants);
  });

  it('gives every participant in a room a unique identity', async () => {
    const { store, service } = setup();
    const owner = await service.handleMessage(conn(1), { type: 'create_room', geohash: null });
    const roomId = owner.roomId ?? '';
    for (let i = 2; i <= MAX_PARTICIPANTS; i += 1) {
      await service.handleMessage(conn(i), {
        type: 'join',
        geohash: 'xn76cy',
        roomId,
        roomCode: null,
      });
    }
    const room = await store.getRoomById(roomId);
    const keys = room?.participants.map((p) => `${p.identity.color}/${p.identity.icon}`) ?? [];
    expect(keys).toHaveLength(MAX_PARTICIPANTS);
    expect(new Set(keys).size).toBe(MAX_PARTICIPANTS);
  });
});
