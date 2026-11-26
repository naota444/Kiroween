import { describe, expect, it } from 'vitest';
import { MemoryRoomStore } from './memory-room-store.js';
import type { NewDrawing } from './room-store.js';
import type { Participant, Room } from './room-types.js';
import { runRoomStoreContract } from './testing/room-store-contract.js';

runRoomStoreContract('MemoryRoomStore', () => new MemoryRoomStore());

const room = (over: Partial<Room> = {}): Room => ({
  roomId: 'r1',
  roomCode: '1234',
  geohash: 'xn76ur',
  createdAt: 0,
  expiresAt: 1000,
  participants: [],
  ...over,
});

const person = (n: number): Participant => ({
  connectionId: `c${n}`,
  identity: { color: 'red', icon: n === 0 ? 'cat' : 'dog' },
  joinedAt: 0,
});

const drawing = (n: number): NewDrawing => ({
  drawingId: `d${n}`,
  sender: { color: 'red', icon: 'cat' },
  image: { imageData: 'AAAA', imageKey: null },
  createdAt: n,
});

describe('MemoryRoomStore (smoke)', () => {
  it('creates and gets a room by id and code', async () => {
    const store = new MemoryRoomStore();
    expect(await store.createRoom(room(), 0)).toEqual({ ok: true });
    expect((await store.getRoomById('r1'))?.roomCode).toBe('1234');
    expect((await store.getRoomByCode('1234'))?.roomId).toBe('r1');
    expect(await store.getRoomById('none')).toBeNull();
    expect(await store.createRoom(room({ roomId: 'r2' }), 0)).toEqual({
      ok: false,
      reason: 'code_taken',
    });
  });

  it('returns full when the room is at capacity', async () => {
    const store = new MemoryRoomStore();
    await store.createRoom(room(), 0);
    const first = await store.addParticipant('r1', person(0), 1);
    expect(first.ok && first.added).toBe(true);
    expect(await store.addParticipant('r1', person(1), 1)).toEqual({ ok: false, reason: 'full' });
  });

  it('assigns seq from 1 and truncates to maxDrawings', async () => {
    const store = new MemoryRoomStore();
    await store.createRoom(room(), 0);
    for (let i = 1; i <= 4; i++) {
      const r = await store.appendDrawing('r1', drawing(i), 3);
      expect(r.ok && r.drawing.seq).toBe(i);
    }
    expect((await store.listDrawings('r1')).map((d) => d.seq)).toEqual([2, 3, 4]);
  });

  it('frees the room code after deleteExpired', async () => {
    const store = new MemoryRoomStore();
    await store.createRoom(room(), 0);
    expect(await store.deleteExpired(999)).toEqual([]);
    expect(await store.deleteExpired(1000)).toEqual([{ roomId: 'r1', geohash: 'xn76ur' }]);
    expect(await store.getRoomByCode('1234')).toBeNull();
    expect(await store.createRoom(room({ roomId: 'r3', expiresAt: 5000 }), 1000)).toEqual({
      ok: true,
    });
  });
});
