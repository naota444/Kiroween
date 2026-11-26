import {
  GEOHASH_ALPHABET,
  GEOHASH_LENGTH,
  MAX_AI_TEXT_LENGTH,
  MAX_ERROR_MESSAGE_LENGTH,
  MAX_MESSAGE_BYTES,
  MAX_PARTICIPANTS,
  MAX_ROOMS,
  PARTICIPANT_COLORS,
  PARTICIPANT_ICONS,
  type ClientMessage,
  type ErrorCode,
  type ParticipantIdentity,
  type ServerMessage,
} from './messages.js';

export type ParseResult<T> =
  { ok: true; value: T } | { ok: false; error: { code: ErrorCode; message: string } };

type Failure = { ok: false; error: { code: ErrorCode; message: string } };
type Obj = Record<string, unknown>;
type Check<T> = { ok: true; value: T } | Failure;

const ERROR_CODES: readonly ErrorCode[] = [
  'invalid_json',
  'unknown_type',
  'missing_field',
  'invalid_field',
  'message_too_large',
  'room_not_found',
  'room_full',
  'internal_error',
];

const CLIENT_TYPES = ['join', 'leave', 'drawing_submit', 'create_room', 'join_by_code'] as const;
const SERVER_TYPES = [
  'room_list',
  'ai_comment',
  'ai_prompt',
  'ai_card',
  'error',
  'room_created',
  'room_joined',
  'room_left',
  'participant_joined',
  'participant_left',
  'drawing_added',
] as const;

// ---- 小さな検査関数 ----
export function codePointLength(text: string): number {
  return [...text].length;
}

export function isGeohash(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const chars = [...value];
  return chars.length === GEOHASH_LENGTH && chars.every((c) => GEOHASH_ALPHABET.includes(c));
}

export function isRoomCode(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}$/.test(value);
}

function fail(code: ErrorCode, message: string): Failure {
  return { ok: false, error: { code, message } };
}

function isObject(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function has(obj: Obj, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined;
}

/** 必須フィールドがすべてあるか。なければ missing_field。 */
function requireFields(obj: Obj, keys: readonly string[]): Failure | null {
  for (const key of keys) {
    if (!has(obj, key)) return fail('missing_field', `missing field: ${key}`);
  }
  return null;
}

function checkString(obj: Obj, key: string): Check<string> {
  const v = obj[key];
  return typeof v === 'string'
    ? { ok: true, value: v }
    : fail('invalid_field', `${key} must be a string`);
}

function checkNullableString(obj: Obj, key: string): Check<string | null> {
  const v = obj[key];
  return v === null || typeof v === 'string'
    ? { ok: true, value: v }
    : fail('invalid_field', `${key} must be a string or null`);
}

function checkText(obj: Obj, key: string, max: number): Check<string> {
  const v = obj[key];
  if (typeof v !== 'string') return fail('invalid_field', `${key} must be a string`);
  const len = codePointLength(v);
  return len >= 1 && len <= max
    ? { ok: true, value: v }
    : fail('invalid_field', `${key} must be 1 to ${max} characters`);
}

// ---- クライアントメッセージ ----
function parseJoin(o: Obj): ParseResult<ClientMessage> {
  const missing = requireFields(o, ['roomId', 'geohash', 'roomCode']);
  if (missing) return missing;
  const roomId = checkNullableString(o, 'roomId');
  if (!roomId.ok) return roomId;
  if (!isGeohash(o.geohash)) {
    return fail('invalid_field', `geohash must be ${GEOHASH_LENGTH} geohash characters`);
  }
  const roomCode = o.roomCode;
  if (roomCode !== null && !isRoomCode(roomCode)) {
    return fail('invalid_field', 'roomCode must be 4 digits or null');
  }
  return {
    ok: true,
    value: { type: 'join', roomId: roomId.value, geohash: o.geohash, roomCode },
  };
}

function parseLeave(o: Obj): ParseResult<ClientMessage> {
  const missing = requireFields(o, ['roomId']);
  if (missing) return missing;
  const roomId = checkString(o, 'roomId');
  if (!roomId.ok) return roomId;
  return { ok: true, value: { type: 'leave', roomId: roomId.value } };
}

function parseDrawingSubmit(o: Obj): ParseResult<ClientMessage> {
  const missing = requireFields(o, ['roomId', 'imageData', 'imageKey']);
  if (missing) return missing;
  const roomId = checkString(o, 'roomId');
  if (!roomId.ok) return roomId;
  const imageData = checkNullableString(o, 'imageData');
  if (!imageData.ok) return imageData;
  const imageKey = checkNullableString(o, 'imageKey');
  if (!imageKey.ok) return imageKey;
  if (imageData.value !== null && imageKey.value === null) {
    return {
      ok: true,
      value: {
        type: 'drawing_submit',
        roomId: roomId.value,
        imageData: imageData.value,
        imageKey: null,
      },
    };
  }
  if (imageData.value === null && imageKey.value !== null) {
    return {
      ok: true,
      value: {
        type: 'drawing_submit',
        roomId: roomId.value,
        imageData: null,
        imageKey: imageKey.value,
      },
    };
  }
  return fail('invalid_field', 'exactly one of imageData or imageKey must be non-null');
}

// ---- サーバーメッセージ ----
function parseRoomList(o: Obj): ParseResult<ServerMessage> {
  const missing = requireFields(o, ['rooms']);
  if (missing) return missing;
  const rooms = o.rooms;
  if (!Array.isArray(rooms)) return fail('invalid_field', 'rooms must be an array');
  if (rooms.length > MAX_ROOMS)
    return fail('invalid_field', `rooms must have at most ${MAX_ROOMS} entries`);
  const out = [];
  for (const item of rooms as unknown[]) {
    if (!isObject(item)) return fail('invalid_field', 'rooms entries must be objects');
    const m = requireFields(item, [
      'roomId',
      'roomCode',
      'geohash',
      'participantCount',
      'sameHash',
    ]);
    if (m) return m;
    const roomId = checkString(item, 'roomId');
    if (!roomId.ok) return roomId;
    if (!isRoomCode(item.roomCode)) return fail('invalid_field', 'roomCode must be 4 digits');
    if (!isGeohash(item.geohash)) {
      return fail('invalid_field', `geohash must be ${GEOHASH_LENGTH} geohash characters`);
    }
    const count = item.participantCount;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      return fail('invalid_field', 'participantCount must be an integer of 0 or greater');
    }
    if (typeof item.sameHash !== 'boolean')
      return fail('invalid_field', 'sameHash must be a boolean');
    out.push({
      roomId: roomId.value,
      roomCode: item.roomCode,
      geohash: item.geohash,
      participantCount: count,
      sameHash: item.sameHash,
    });
  }
  return { ok: true, value: { type: 'room_list', rooms: out } };
}

function parseAiText(o: Obj, type: 'ai_comment' | 'ai_prompt'): ParseResult<ServerMessage> {
  const missing = requireFields(o, ['roomId', 'text']);
  if (missing) return missing;
  const roomId = checkString(o, 'roomId');
  if (!roomId.ok) return roomId;
  const text = checkText(o, 'text', MAX_AI_TEXT_LENGTH);
  if (!text.ok) return text;
  return { ok: true, value: { type, roomId: roomId.value, text: text.value } };
}

function parseAiCard(o: Obj): ParseResult<ServerMessage> {
  const missing = requireFields(o, ['roomId', 'text', 'imageKey']);
  if (missing) return missing;
  const roomId = checkString(o, 'roomId');
  if (!roomId.ok) return roomId;
  const text = checkText(o, 'text', MAX_AI_TEXT_LENGTH);
  if (!text.ok) return text;
  const imageKey = checkString(o, 'imageKey');
  if (!imageKey.ok) return imageKey;
  return {
    ok: true,
    value: { type: 'ai_card', roomId: roomId.value, text: text.value, imageKey: imageKey.value },
  };
}

function parseErrorMessage(o: Obj): ParseResult<ServerMessage> {
  const missing = requireFields(o, ['code', 'message']);
  if (missing) return missing;
  const code = o.code;
  if (typeof code !== 'string' || !(ERROR_CODES as readonly string[]).includes(code)) {
    return fail('invalid_field', 'code must be a known error code');
  }
  const message = checkText(o, 'message', MAX_ERROR_MESSAGE_LENGTH);
  if (!message.ok) return message;
  return { ok: true, value: { type: 'error', code: code as ErrorCode, message: message.value } };
}

// ---- 新しいクライアントメッセージ ----
function parseCreateRoom(o: Obj): ParseResult<ClientMessage> {
  const missing = requireFields(o, ['geohash']);
  if (missing) return missing;
  const geohash = o.geohash;
  if (geohash !== null && !isGeohash(geohash)) {
    return fail('invalid_field', `geohash must be ${GEOHASH_LENGTH} geohash characters or null`);
  }
  return { ok: true, value: { type: 'create_room', geohash } };
}

function parseJoinByCode(o: Obj): ParseResult<ClientMessage> {
  const missing = requireFields(o, ['roomCode']);
  if (missing) return missing;
  if (!isRoomCode(o.roomCode)) return fail('invalid_field', 'roomCode must be 4 digits');
  return { ok: true, value: { type: 'join_by_code', roomCode: o.roomCode } };
}

// ---- 新しいサーバーメッセージ ----
/** color と icon が定数に含まれる ParticipantIdentity を検査する。余分なフィールドは捨てる。 */
function checkIdentity(obj: Obj, key: string): Check<ParticipantIdentity> {
  const v = obj[key];
  if (!isObject(v)) return fail('invalid_field', `${key} must be an object`);
  const missing = requireFields(v, ['color', 'icon']);
  if (missing) return missing;
  const { color, icon } = v;
  if (typeof color !== 'string' || !(PARTICIPANT_COLORS as readonly string[]).includes(color)) {
    return fail('invalid_field', `${key}.color must be a known color`);
  }
  if (typeof icon !== 'string' || !(PARTICIPANT_ICONS as readonly string[]).includes(icon)) {
    return fail('invalid_field', `${key}.icon must be a known icon`);
  }
  return {
    ok: true,
    value: { color, icon } as ParticipantIdentity,
  };
}

function parseRoomCreated(o: Obj): ParseResult<ServerMessage> {
  const missing = requireFields(o, ['roomId', 'roomCode']);
  if (missing) return missing;
  const roomId = checkString(o, 'roomId');
  if (!roomId.ok) return roomId;
  if (!isRoomCode(o.roomCode)) return fail('invalid_field', 'roomCode must be 4 digits');
  return { ok: true, value: { type: 'room_created', roomId: roomId.value, roomCode: o.roomCode } };
}

function parseRoomJoined(o: Obj): ParseResult<ServerMessage> {
  const missing = requireFields(o, ['roomId', 'roomCode', 'you', 'participants']);
  if (missing) return missing;
  const roomId = checkString(o, 'roomId');
  if (!roomId.ok) return roomId;
  if (!isRoomCode(o.roomCode)) return fail('invalid_field', 'roomCode must be 4 digits');
  const you = checkIdentity(o, 'you');
  if (!you.ok) return you;
  const list = o.participants;
  if (!Array.isArray(list)) return fail('invalid_field', 'participants must be an array');
  if (list.length < 1 || list.length > MAX_PARTICIPANTS) {
    return fail('invalid_field', `participants must have 1 to ${MAX_PARTICIPANTS} entries`);
  }
  const participants: ParticipantIdentity[] = [];
  for (const item of list as unknown[]) {
    const id = checkIdentity({ item }, 'item');
    if (!id.ok) return id;
    participants.push(id.value);
  }
  return {
    ok: true,
    value: {
      type: 'room_joined',
      roomId: roomId.value,
      roomCode: o.roomCode,
      you: you.value,
      participants,
    },
  };
}

function parseRoomLeft(o: Obj): ParseResult<ServerMessage> {
  const missing = requireFields(o, ['roomId']);
  if (missing) return missing;
  const roomId = checkString(o, 'roomId');
  if (!roomId.ok) return roomId;
  return { ok: true, value: { type: 'room_left', roomId: roomId.value } };
}

function parseParticipantEvent(
  o: Obj,
  type: 'participant_joined' | 'participant_left',
): ParseResult<ServerMessage> {
  const missing = requireFields(o, ['roomId', 'participant']);
  if (missing) return missing;
  const roomId = checkString(o, 'roomId');
  if (!roomId.ok) return roomId;
  const participant = checkIdentity(o, 'participant');
  if (!participant.ok) return participant;
  return { ok: true, value: { type, roomId: roomId.value, participant: participant.value } };
}

function parseDrawingAdded(o: Obj): ParseResult<ServerMessage> {
  const missing = requireFields(o, [
    'roomId',
    'drawingId',
    'seq',
    'sender',
    'imageData',
    'imageKey',
  ]);
  if (missing) return missing;
  const roomId = checkString(o, 'roomId');
  if (!roomId.ok) return roomId;
  const drawingId = checkString(o, 'drawingId');
  if (!drawingId.ok) return drawingId;
  const seq = o.seq;
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 1) {
    return fail('invalid_field', 'seq must be an integer of 1 or greater');
  }
  const sender = checkIdentity(o, 'sender');
  if (!sender.ok) return sender;
  const imageData = checkNullableString(o, 'imageData');
  if (!imageData.ok) return imageData;
  const imageKey = checkNullableString(o, 'imageKey');
  if (!imageKey.ok) return imageKey;
  const base = {
    type: 'drawing_added' as const,
    roomId: roomId.value,
    drawingId: drawingId.value,
    seq,
    sender: sender.value,
  };
  if (imageData.value !== null && imageKey.value === null) {
    return { ok: true, value: { ...base, imageData: imageData.value, imageKey: null } };
  }
  if (imageData.value === null && imageKey.value !== null) {
    return { ok: true, value: { ...base, imageData: null, imageKey: imageKey.value } };
  }
  return fail('invalid_field', 'exactly one of imageData or imageKey must be non-null');
}

// ---- 共通の入口 ----

/** JSON を読み、オブジェクトであることと type の所属を確認する。throw しない。 */
function readEnvelope(raw: string, types: readonly string[]): Check<{ obj: Obj; type: string }> {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return fail('invalid_json', 'message is not valid JSON');
  }
  if (!isObject(data)) return fail('invalid_json', 'message must be a JSON object');
  if (!has(data, 'type')) return fail('missing_field', 'missing field: type');
  const type = data.type;
  if (typeof type !== 'string' || !types.includes(type)) {
    return fail('unknown_type', 'unknown message type');
  }
  return { ok: true, value: { obj: data, type } };
}

export function parseClientMessage(raw: string): ParseResult<ClientMessage> {
  try {
    if (new TextEncoder().encode(raw).length > MAX_MESSAGE_BYTES) {
      return fail('message_too_large', `message exceeds ${MAX_MESSAGE_BYTES} bytes`);
    }
    const env = readEnvelope(raw, CLIENT_TYPES);
    if (!env.ok) return env;
    const { obj, type } = env.value;
    switch (type) {
      case 'join':
        return parseJoin(obj);
      case 'leave':
        return parseLeave(obj);
      case 'drawing_submit':
        return parseDrawingSubmit(obj);
      case 'create_room':
        return parseCreateRoom(obj);
      case 'join_by_code':
        return parseJoinByCode(obj);
      default:
        return fail('unknown_type', 'unknown message type');
    }
  } catch {
    return fail('internal_error', 'unexpected error while parsing');
  }
}

export function parseServerMessage(raw: string): ParseResult<ServerMessage> {
  try {
    const env = readEnvelope(raw, SERVER_TYPES);
    if (!env.ok) return env;
    const { obj, type } = env.value;
    switch (type) {
      case 'room_list':
        return parseRoomList(obj);
      case 'ai_comment':
        return parseAiText(obj, 'ai_comment');
      case 'ai_prompt':
        return parseAiText(obj, 'ai_prompt');
      case 'ai_card':
        return parseAiCard(obj);
      case 'error':
        return parseErrorMessage(obj);
      case 'room_created':
        return parseRoomCreated(obj);
      case 'room_joined':
        return parseRoomJoined(obj);
      case 'room_left':
        return parseRoomLeft(obj);
      case 'participant_joined':
        return parseParticipantEvent(obj, 'participant_joined');
      case 'participant_left':
        return parseParticipantEvent(obj, 'participant_left');
      case 'drawing_added':
        return parseDrawingAdded(obj);
      default:
        return fail('unknown_type', 'unknown message type');
    }
  } catch {
    return fail('internal_error', 'unexpected error while parsing');
  }
}
