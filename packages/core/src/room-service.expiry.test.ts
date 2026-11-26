import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createManualClock } from './clock.js';
import { MemoryRoomStore } from './memory-room-store.js';
import type { ServerMessage } from './messages.js';
import { RoomService } from './room-service.js';
import type { ConnectionState } from './room-types.js';
import {
  createFakePorts,
  createSequentialIds,
  simpleOrderRooms,
} from './testing/room-service-fixture.js';

const HERE = 'xn76ur';
const RETENTION = 10_000;
const START = 1_000_000;

const none = (id: string): ConnectionState => ({ connectionId: id, geohash: null, roomId: null });

function setup() {
  const clock = createManualClock(START);
  const store = new MemoryRoomStore();
  const ports = createFakePorts();
  const service = new RoomService({
    store,
    ports,
    orderRooms: simpleOrderRooms,
    clock,
    newId: createSequentialIds('room'),
    retentionMs: RETENTION,
    random: () => 0, // 部屋番号は常に 0000 を狙う(再利用の確認用)
  });
  return { clock, store, ports, service };
}

/** a が部屋を作って参加し、絵を1枚送った状態にする */
async function createRoomWithDrawing(ctx: ReturnType<typeof setup>) {
  const a = await ctx.service.handleMessage(none('a'), { type: 'create_room', geohash: HERE });
  const roomId = a.roomId ?? '';
  const room = await ctx.store.getRoomById(roomId);
  await ctx.service.handleMessage(a, {
    type: 'drawing_submit',
    roomId,
    imageData: 'AAAA',
    imageKey: null,
  });
  ctx.ports.clear();
  return { a, roomId, roomCode: room?.roomCode ?? '', expiresAt: room?.expiresAt ?? 0 };
}

const errorCodes = (messages: ServerMessage[]) =>
  messages.flatMap((m) => (m.type === 'error' ? [m.code] : []));

const listedIds = (messages: ServerMessage[]) =>
  messages.flatMap((m) => (m.type === 'room_list' ? m.rooms.map((r) => r.roomId) : []));

async function probe(
  ctx: ReturnType<typeof setup>,
  roomId: string,
  roomCode: string,
  a: ConnectionState,
) {
  ctx.ports.clear();
  await ctx.service.handleMessage(none('p-join'), { type: 'join_by_code', roomCode });
  await ctx.service.handleMessage(none('p-list'), {
    type: 'join',
    geohash: HERE,
    roomId: null,
    roomCode: null,
  });
  await ctx.service.handleMessage(a, {
    type: 'drawing_submit',
    roomId,
    imageData: 'BBBB',
    imageKey: null,
  });
  return {
    joined: ctx.ports.messagesTo('p-join').some((m) => m.type === 'room_joined'),
    joinErrors: errorCodes(ctx.ports.messagesTo('p-join')),
    listed: listedIds(ctx.ports.messagesTo('p-list')).includes(roomId),
    drawErrors: errorCodes(ctx.ports.messagesTo('a')),
  };
}

describe('room expiry', () => {
  it('works just before expiresAt', async () => {
    const ctx = setup();
    const { a, roomId, roomCode, expiresAt } = await createRoomWithDrawing(ctx);
    expect(expiresAt).toBe(START + RETENTION);
    ctx.clock.set(expiresAt - 1);
    const result = await probe(ctx, roomId, roomCode, a);
    expect(result).toEqual({ joined: true, joinErrors: [], listed: true, drawErrors: [] });
    expect(await ctx.store.listDrawings(roomId)).toHaveLength(2);
  });

  it('treats the room as missing at exactly expiresAt', async () => {
    const ctx = setup();
    const { a, roomId, roomCode, expiresAt } = await createRoomWithDrawing(ctx);
    ctx.clock.set(expiresAt);
    const result = await probe(ctx, roomId, roomCode, a);
    expect(result).toEqual({
      joined: false,
      joinErrors: ['room_not_found'],
      listed: false,
      drawErrors: ['room_not_found'],
    });
    expect(await ctx.store.listDrawings(roomId)).toHaveLength(1);
  });

  it('removes the room, its code, and drawings on sweep, and frees the code', async () => {
    const ctx = setup();
    const { roomId, roomCode, expiresAt } = await createRoomWithDrawing(ctx);
    ctx.clock.set(expiresAt);
    expect(await ctx.service.sweepExpired()).toBe(1);
    expect(await ctx.store.getRoomById(roomId)).toBeNull();
    expect(await ctx.store.getRoomByCode(roomCode)).toBeNull();
    expect(await ctx.store.listDrawings(roomId)).toEqual([]);
    expect(ctx.ports.changed).toEqual([HERE]);

    const b = await ctx.service.handleMessage(none('b'), { type: 'create_room', geohash: HERE });
    const created = await ctx.store.getRoomById(b.roomId ?? '');
    expect(created?.roomCode).toBe(roomCode);
    expect(b.roomId).not.toBe(roomId);
  });

  it('keeps unexpired rooms and their drawings on sweep', async () => {
    const ctx = setup();
    const old = await createRoomWithDrawing(ctx);
    ctx.clock.advance(RETENTION / 2);
    const fresh = await ctx.service.handleMessage(none('c'), {
      type: 'create_room',
      geohash: HERE,
    });
    const freshId = fresh.roomId ?? '';
    await ctx.service.handleMessage(fresh, {
      type: 'drawing_submit',
      roomId: freshId,
      imageData: 'CCCC',
      imageKey: null,
    });
    ctx.clock.set(old.expiresAt);
    expect(await ctx.service.sweepExpired()).toBe(1);
    expect(await ctx.store.getRoomById(old.roomId)).toBeNull();
    expect(await ctx.store.getRoomById(freshId)).not.toBeNull();
    expect(await ctx.store.listDrawings(freshId)).toHaveLength(1);
  });

  // Feature: local-prototype, Property 17: 期限切れ
  // **Validates: Requirements 10.5, 10.7, 10.8, 14.6, 14.7**
  it('Property 17: visibility depends only on now >= expiresAt', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: RETENTION * 2 }), async (delta) => {
        const ctx = setup();
        const { a, roomId, roomCode, expiresAt } = await createRoomWithDrawing(ctx);
        ctx.clock.set(START + delta);
        const expired = START + delta >= expiresAt;

        const result = await probe(ctx, roomId, roomCode, a);
        expect(result.joined).toBe(!expired);
        expect(result.listed).toBe(!expired);
        expect(result.joinErrors).toEqual(expired ? ['room_not_found'] : []);
        expect(result.drawErrors).toEqual(expired ? ['room_not_found'] : []);

        await ctx.service.sweepExpired();
        const byId = await ctx.store.getRoomById(roomId);
        const byCode = await ctx.store.getRoomByCode(roomCode);
        const drawings = await ctx.store.listDrawings(roomId);
        if (expired) {
          expect(byId).toBeNull();
          expect(byCode).toBeNull();
          expect(drawings).toEqual([]);
        } else {
          expect(byId).not.toBeNull();
          expect(byCode?.roomId).toBe(roomId);
          expect(drawings.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});
