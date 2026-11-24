import { describe, expect, it } from 'vitest';
import { MAX_ROOMS, type RoomSummary } from './messages.js';
import { orderRoomSummaries, type RoomCandidate } from './room-list.js';

const room = (roomId: string, sameHash: boolean): RoomSummary => ({
  roomId,
  roomCode: '0000',
  geohash: 'xn774c',
  participantCount: 1,
  sameHash,
});

describe('orderRoomSummaries', () => {
  it('puts sameHash first, then sorts by distance (stable), without mutating input', () => {
    const input: RoomCandidate[] = [
      { summary: room('far', false), distance: 2 },
      { summary: room('near-a', false), distance: 1 },
      { summary: room('same', true), distance: 0 },
      { summary: room('near-b', false), distance: 1 },
    ];
    const copy = [...input];
    expect(orderRoomSummaries(input).map((r) => r.roomId)).toEqual([
      'same',
      'near-a',
      'near-b',
      'far',
    ]);
    expect(input).toEqual(copy);
  });

  it('returns at most MAX_ROOMS entries', () => {
    const input = Array.from({ length: MAX_ROOMS + 5 }, (_, i) => ({
      summary: room(`r${i}`, false),
      distance: i,
    }));
    expect(orderRoomSummaries(input)).toHaveLength(MAX_ROOMS);
  });
});
