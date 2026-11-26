import { describe, expect, it } from 'vitest';
import { MemoryRoomStore } from './memory-room-store.js';
import { RoomService, selectListSubscribers } from './room-service.js';
import type { ConnectionState } from './room-types.js';
import { neighborCells } from './geohash.js';
import { createFakePorts, simpleOrderRooms } from './testing/room-service-fixture.js';

const HERE = 'xn76ur';
const NEAR = neighborCells(HERE).find((c) => c !== HERE) ?? HERE;

function setup() {
  const store = new MemoryRoomStore();
  const ports = createFakePorts();
  const service = new RoomService({ store, ports, orderRooms: simpleOrderRooms });
  return { service, ports };
}

const conn = (
  id: string,
  geohash: string | null,
  roomId: string | null = null,
): ConnectionState => ({
  connectionId: id,
  geohash,
  roomId,
});

describe('room list', () => {
  it('returns an empty list when there are no rooms', async () => {
    const { service, ports } = setup();
    await service.handleMessage(conn('a', null), {
      type: 'join',
      geohash: HERE,
      roomId: null,
      roomCode: null,
    });
    expect(ports.messagesTo('a')).toEqual([{ type: 'room_list', rooms: [] }]);
  });

  it('lists same-cell rooms first and neighbor rooms after', async () => {
    const { service, ports } = setup();
    await service.handleMessage(conn('n', null), { type: 'create_room', geohash: NEAR });
    await service.handleMessage(conn('h', null), { type: 'create_room', geohash: HERE });
    await service.handleMessage(conn('x', null), { type: 'create_room', geohash: null });
    ports.clear();
    const list = await service.buildRoomList(HERE);
    expect(list.rooms.map((r) => [r.geohash, r.sameHash])).toEqual([
      [HERE, true],
      [NEAR, false],
    ]);
  });

  it('rejects an invalid geohash on join', async () => {
    const { service, ports } = setup();
    await service.handleMessage(conn('a', null), {
      type: 'join',
      geohash: 'bad!',
      roomId: null,
      roomCode: null,
    });
    expect(ports.messagesTo('a')[0]).toMatchObject({ type: 'error', code: 'invalid_field' });
  });
});

describe('selectListSubscribers', () => {
  it('selects only idle, located connections whose neighborhood includes the room cell', () => {
    const connections = [
      conn('same', HERE),
      conn('near', NEAR),
      conn('far', 'u4pruy'),
      conn('inroom', HERE, 'r1'),
      conn('nopos', null),
    ];
    expect(selectListSubscribers(connections, HERE).map((c) => c.connectionId)).toEqual([
      'same',
      'near',
    ]);
  });
});
