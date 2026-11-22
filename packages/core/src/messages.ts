export const MAX_MESSAGE_BYTES = 32_768;
export const MAX_ROOMS = 50;
export const GEOHASH_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz'; // a, i, l, o を含まない
export const GEOHASH_LENGTH = 6;
export const MAX_AI_TEXT_LENGTH = 40; // 文字数 (コードポイント)
export const MAX_ERROR_MESSAGE_LENGTH = 200;

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

export type ClientMessage = Join | Leave | DrawingSubmit;

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

export type ServerMessage = RoomList | AiComment | AiPrompt | AiCard | ErrorMessage;
