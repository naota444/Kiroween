export const MAX_MESSAGE_BYTES = 32_768;
export const MAX_ROOMS = 50;
export const GEOHASH_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz'; // a, i, l, o を含まない
export const GEOHASH_LENGTH = 6;
export const MAX_AI_TEXT_LENGTH = 40; // 文字数 (コードポイント)
export const MAX_ERROR_MESSAGE_LENGTH = 200;

export const MAX_PARTICIPANTS = 8; // 1 部屋の定員
export const MAX_DRAWINGS_PER_ROOM = 50; // 1 部屋に残す絵の枚数
export const MAX_IMAGE_SIDE_PX = 512; // 絵の縦横の上限
export const MAX_IMAGE_DATA_CHARS = 30_000; // imageData(base64)の最大文字数

export const PARTICIPANT_COLORS = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
] as const; // 8 色
export const PARTICIPANT_ICONS = [
  'cat',
  'dog',
  'rabbit',
  'bear',
  'fox',
  'panda',
  'frog',
  'penguin',
  'owl',
  'koala',
  'tiger',
  'whale',
] as const; // 12 種類。色 × アイコン = 96 通り

export type ParticipantColor = (typeof PARTICIPANT_COLORS)[number];
export type ParticipantIcon = (typeof PARTICIPANT_ICONS)[number];
export type ParticipantIdentity = { color: ParticipantColor; icon: ParticipantIcon };

export type ErrorCode =
  | 'invalid_json'
  | 'unknown_type'
  | 'missing_field'
  | 'invalid_field'
  | 'message_too_large'
  | 'room_not_found'
  | 'room_full'
  | 'internal_error';

// ---- Client → Server ----
export type Join = {
  type: 'join';
  roomId: string | null;
  geohash: string; // 6 文字、GEOHASH_ALPHABET のみ
  roomCode: string | null; // 4 桁の数字
};
export type Leave = { type: 'leave'; roomId: string };

type DrawingSubmitBase = { type: 'drawing_submit'; roomId: string };
export type DrawingSubmit = DrawingSubmitBase &
  (
    | { imageData: string; imageKey: null } // base64 PNG をそのまま送る
    | { imageData: null; imageKey: string } // 大きい画像は S3 キーだけ送る
  );

export type CreateRoom = {
  type: 'create_room';
  geohash: string | null; // 6 文字、または位置なしを表す null。キー自体は必須
};
export type JoinByCode = {
  type: 'join_by_code'; // 位置情報なしで部屋番号だけで参加する
  roomCode: string; // 4 桁の数字
};

export type ClientMessage = Join | Leave | DrawingSubmit | CreateRoom | JoinByCode;

// ---- Server → Client ----
export type RoomSummary = {
  roomId: string;
  roomCode: string;
  geohash: string;
  participantCount: number; // 0 以上の整数
  sameHash: boolean;
};
export type RoomList = { type: 'room_list'; rooms: RoomSummary[] }; // 最大 50 件
export type AiComment = { type: 'ai_comment'; roomId: string; text: string };
export type AiPrompt = { type: 'ai_prompt'; roomId: string; text: string };
export type AiCard = { type: 'ai_card'; roomId: string; text: string; imageKey: string };
export type ErrorMessage = { type: 'error'; code: ErrorCode; message: string };

export type RoomCreated = { type: 'room_created'; roomId: string; roomCode: string };
export type RoomJoined = {
  type: 'room_joined';
  roomId: string;
  roomCode: string;
  you: ParticipantIdentity;
  participants: ParticipantIdentity[]; // 自分を含む全員。1〜MAX_PARTICIPANTS 件
};
export type RoomLeft = { type: 'room_left'; roomId: string };
export type ParticipantJoined = {
  type: 'participant_joined';
  roomId: string;
  participant: ParticipantIdentity; // 新しく入った人
};
export type ParticipantLeft = {
  type: 'participant_left';
  roomId: string;
  participant: ParticipantIdentity; // 出た人
};
type DrawingAddedBase = {
  type: 'drawing_added';
  roomId: string;
  drawingId: string; // 部屋内で一意
  seq: number; // 部屋ごとの受理順(1 から。整数)
  sender: ParticipantIdentity;
};
export type DrawingAdded = DrawingAddedBase &
  ({ imageData: string; imageKey: null } | { imageData: null; imageKey: string }); // DrawingSubmit と同じ「どちらか一方」の形

export type ServerMessage =
  | RoomList
  | AiComment
  | AiPrompt
  | AiCard
  | ErrorMessage
  | RoomCreated
  | RoomJoined
  | RoomLeft
  | ParticipantJoined
  | ParticipantLeft
  | DrawingAdded;
