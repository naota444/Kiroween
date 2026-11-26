import type { AppAction, AppState } from './app-state.js';
import { INITIAL_STATE, reducer } from './app-state.js';
import { describe, expect, it } from 'vitest';

function apply(actions: AppAction[], start = INITIAL_STATE): AppState {
  return actions.reduce(reducer, start);
}

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------

describe('connection lifecycle', () => {
  it('starts as connecting', () => {
    expect(INITIAL_STATE.connection).toBe('connecting');
  });

  it('transitions to open on connection_opened', () => {
    const s = apply([{ type: 'connection_opened' }]);
    expect(s.connection).toBe('open');
  });

  it('transitions to closed on connection_closed', () => {
    const s = apply([{ type: 'connection_opened' }, { type: 'connection_closed' }]);
    expect(s.connection).toBe('closed');
  });

  it('reset_connection goes back to connecting and keeps location', () => {
    const s = apply([
      { type: 'location_ready', geohash: 'xn76ur' },
      { type: 'connection_closed' },
      { type: 'reset_connection' },
    ]);
    expect(s.connection).toBe('connecting');
    expect(s.location).toEqual({ status: 'ready', geohash: 'xn76ur' });
    expect(s.room).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Entry → Room → Entry transition
// ---------------------------------------------------------------------------

describe('Entry → Room → Entry', () => {
  it('room_created sets up room skeleton with you:null', () => {
    const s = apply([
      { type: 'connection_opened' },
      {
        type: 'server_message',
        message: { type: 'room_created', roomId: 'r1', roomCode: '1234' },
      },
    ]);
    expect(s.room).not.toBeNull();
    expect(s.room?.roomCode).toBe('1234');
    expect(s.room?.you).toBeNull();
  });

  it('room_joined fills in identity after room_created', () => {
    const s = apply([
      {
        type: 'server_message',
        message: { type: 'room_created', roomId: 'r1', roomCode: '1234' },
      },
      {
        type: 'server_message',
        message: {
          type: 'room_joined',
          roomId: 'r1',
          roomCode: '1234',
          you: { color: 'red', icon: 'cat' },
          participants: [{ color: 'red', icon: 'cat' }],
        },
      },
    ]);
    expect(s.room?.you).toEqual({ color: 'red', icon: 'cat' });
    expect(s.room?.participants).toHaveLength(1);
  });

  it('left_room returns to Entry', () => {
    const inRoom = apply([
      {
        type: 'server_message',
        message: { type: 'room_created', roomId: 'r1', roomCode: '1234' },
      },
    ]);
    const s = reducer(inRoom, { type: 'left_room' });
    expect(s.room).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// drawing_added deduplication and ordering
// ---------------------------------------------------------------------------

describe('drawing_added', () => {
  const inRoom: AppState = {
    ...INITIAL_STATE,
    room: {
      roomId: 'r1',
      roomCode: '1234',
      you: { color: 'red', icon: 'cat' },
      participants: [{ color: 'red', icon: 'cat' }],
      drawings: [],
    },
  };

  it('adds drawings in seq order regardless of arrival order', () => {
    const s = apply(
      [
        {
          type: 'server_message',
          message: {
            type: 'drawing_added',
            roomId: 'r1',
            drawingId: 'd2',
            seq: 2,
            sender: { color: 'blue', icon: 'dog' },
            imageData: 'b64b',
            imageKey: null,
          },
        },
        {
          type: 'server_message',
          message: {
            type: 'drawing_added',
            roomId: 'r1',
            drawingId: 'd1',
            seq: 1,
            sender: { color: 'blue', icon: 'dog' },
            imageData: 'b64a',
            imageKey: null,
          },
        },
      ],
      inRoom,
    );
    expect(s.room?.drawings.map((d) => d.seq)).toEqual([1, 2]);
  });

  it('ignores duplicate drawingId', () => {
    const s = apply(
      [
        {
          type: 'server_message',
          message: {
            type: 'drawing_added',
            roomId: 'r1',
            drawingId: 'd1',
            seq: 1,
            sender: { color: 'blue', icon: 'dog' },
            imageData: 'b64a',
            imageKey: null,
          },
        },
        {
          type: 'server_message',
          message: {
            type: 'drawing_added',
            roomId: 'r1',
            drawingId: 'd1',
            seq: 1,
            sender: { color: 'blue', icon: 'dog' },
            imageData: 'b64a',
            imageKey: null,
          },
        },
      ],
      inRoom,
    );
    expect(s.room?.drawings).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Error in entry — codeDigits preserved
// ---------------------------------------------------------------------------

describe('error handling', () => {
  it('shows error text in entry and keeps codeDigits', () => {
    const withDigits = apply([
      { type: 'keypad_digit', digit: '1' },
      { type: 'keypad_digit', digit: '2' },
    ]);
    const s = reducer(withDigits, {
      type: 'server_message',
      message: { type: 'error', code: 'room_not_found', message: 'not found' },
    });
    expect(s.entry.error).toBe("We couldn't find that room. Check the code and try again.");
    expect(s.entry.codeDigits).toBe('12');
  });

  it('marks send as failed when error arrives during sending', () => {
    const sending: AppState = { ...INITIAL_STATE, send: { status: 'sending' } };
    const s = reducer(sending, {
      type: 'server_message',
      message: {
        type: 'error',
        code: 'message_too_large',
        message: 'too large',
      },
    });
    expect(s.send.status).toBe('failed');
  });
});
