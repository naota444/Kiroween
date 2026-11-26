import type { ParticipantIdentity, RoomSummary, ServerMessage } from '@doodle-nearby/core';
import { ERROR_MESSAGES } from '../error-messages.js';

// ---------------------------------------------------------------------------
// Sub-types
// ---------------------------------------------------------------------------

export type LocationState =
  { status: 'pending' } | { status: 'ready'; geohash: string } | { status: 'unavailable' };

export type BoardDrawing = {
  drawingId: string;
  seq: number;
  sender: ParticipantIdentity;
  imageData: string | null; // imageKey drawings use null (placeholder)
};

export type RoomView = {
  roomId: string;
  roomCode: string;
  you: ParticipantIdentity | null; // null just after room_created, filled by room_joined
  participants: ParticipantIdentity[];
  drawings: BoardDrawing[]; // sorted by seq, deduplicated by drawingId
};

// ---------------------------------------------------------------------------
// AppState
// ---------------------------------------------------------------------------

export type AppState = {
  connection: 'connecting' | 'open' | 'closed';
  location: LocationState;
  rooms: RoomSummary[] | null; // null = room list not yet received
  entry: {
    codeDigits: string; // '' to 4 numeric characters
    showKeypad: boolean;
    pending: 'none' | 'joining' | 'creating';
    error: string | null; // English display string
  };
  room: RoomView | null; // null = Entry screen, non-null = Room screen
  send: { status: 'idle' | 'sending' | 'failed' };
};

// ---------------------------------------------------------------------------
// AppAction
// ---------------------------------------------------------------------------

export type AppAction =
  | { type: 'connection_opened' }
  | { type: 'connection_closed' }
  | { type: 'location_ready'; geohash: string }
  | { type: 'location_unavailable' }
  | { type: 'server_message'; message: ServerMessage }
  | { type: 'keypad_digit'; digit: string }
  | { type: 'keypad_backspace' }
  | { type: 'keypad_toggle' }
  | { type: 'join_requested' }
  | { type: 'create_requested' }
  | { type: 'left_room' }
  | { type: 'send_started' }
  | { type: 'send_timeout' }
  | { type: 'reset_connection' };

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export const INITIAL_STATE: AppState = {
  connection: 'connecting',
  location: { status: 'pending' },
  rooms: null,
  entry: {
    codeDigits: '',
    showKeypad: false,
    pending: 'none',
    error: null,
  },
  room: null,
  send: { status: 'idle' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Insert a drawing into the sorted list, ignoring duplicates by drawingId */
function insertDrawing(drawings: BoardDrawing[], next: BoardDrawing): BoardDrawing[] {
  if (drawings.some((d) => d.drawingId === next.drawingId)) return drawings;
  const updated = [...drawings, next];
  updated.sort((a, b) => a.seq - b.seq);
  return updated;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    // ---- Connection lifecycle ----

    case 'connection_opened':
      return { ...state, connection: 'open' };

    case 'connection_closed':
      return { ...state, connection: 'closed' };

    case 'reset_connection':
      return {
        ...INITIAL_STATE,
        location: state.location, // keep location across reconnect
        connection: 'connecting',
      };

    // ---- Location ----

    case 'location_ready':
      return { ...state, location: { status: 'ready', geohash: action.geohash } };

    case 'location_unavailable':
      return { ...state, location: { status: 'unavailable' } };

    // ---- Keypad ----

    case 'keypad_digit': {
      const { codeDigits } = state.entry;
      if (codeDigits.length >= 4) return state;
      return {
        ...state,
        entry: { ...state.entry, codeDigits: codeDigits + action.digit },
      };
    }

    case 'keypad_backspace':
      return {
        ...state,
        entry: {
          ...state.entry,
          codeDigits: state.entry.codeDigits.slice(0, -1),
        },
      };

    case 'keypad_toggle':
      return {
        ...state,
        entry: { ...state.entry, showKeypad: !state.entry.showKeypad },
      };

    // ---- Entry actions ----

    case 'join_requested':
      return {
        ...state,
        entry: { ...state.entry, pending: 'joining', error: null },
      };

    case 'create_requested':
      return {
        ...state,
        entry: { ...state.entry, pending: 'creating', error: null },
      };

    case 'left_room':
      return { ...state, room: null, send: { status: 'idle' } };

    // ---- Send status ----

    case 'send_started':
      return { ...state, send: { status: 'sending' } };

    case 'send_timeout':
      return { ...state, send: { status: 'failed' } };

    // ---- Server messages ----

    case 'server_message':
      return handleServerMessage(state, action.message);

    default:
      return state;
  }
}

function handleServerMessage(state: AppState, message: ServerMessage): AppState {
  switch (message.type) {
    case 'room_list':
      return { ...state, rooms: message.rooms };

    case 'room_created':
      return {
        ...state,
        entry: { ...state.entry, pending: 'none' },
        room: {
          roomId: message.roomId,
          roomCode: message.roomCode,
          you: null,
          participants: [],
          drawings: [],
        },
      };

    case 'room_joined':
      if (state.room === null) {
        // Joining a room for the first time (no prior room_created)
        return {
          ...state,
          entry: { ...state.entry, pending: 'none' },
          room: {
            roomId: message.roomId,
            roomCode: message.roomCode,
            you: message.you,
            participants: message.participants,
            drawings: [],
          },
        };
      }
      // Filling in identity after room_created
      return {
        ...state,
        room: {
          ...state.room,
          roomId: message.roomId,
          roomCode: message.roomCode,
          you: message.you,
          participants: message.participants,
        },
      };

    case 'room_left':
      return { ...state, room: null, send: { status: 'idle' } };

    case 'participant_joined': {
      if (state.room === null) return state;
      return {
        ...state,
        room: {
          ...state.room,
          participants: [...state.room.participants, message.participant],
        },
      };
    }

    case 'participant_left': {
      if (state.room === null) return state;
      return {
        ...state,
        room: {
          ...state.room,
          participants: state.room.participants.filter(
            (p) => !(p.color === message.participant.color && p.icon === message.participant.icon),
          ),
        },
      };
    }

    case 'drawing_added': {
      if (state.room === null) return state;

      const drawing: BoardDrawing = {
        drawingId: message.drawingId,
        seq: message.seq,
        sender: message.sender,
        imageData: message.imageData ?? null,
      };

      const drawings = insertDrawing(state.room.drawings, drawing);

      // If this is our own drawing being acknowledged, clear send state
      const isMine =
        state.room.you !== null &&
        message.sender.color === state.room.you.color &&
        message.sender.icon === state.room.you.icon;
      const send =
        isMine && state.send.status === 'sending' ? { status: 'idle' as const } : state.send;

      return {
        ...state,
        room: { ...state.room, drawings },
        send,
      };
    }

    case 'error': {
      const text = ERROR_MESSAGES[message.code];
      // If sending, mark as failed
      if (state.send.status === 'sending') {
        return { ...state, send: { status: 'failed' } };
      }
      // Otherwise show error in entry (keep codeDigits)
      return {
        ...state,
        entry: { ...state.entry, error: text, pending: 'none' },
      };
    }

    // Ignore AI messages and others not relevant to this UI
    default:
      return state;
  }
}
