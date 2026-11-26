import type { ParticipantIdentity } from './messages.js';

export type DrawingImage =
  { imageData: string; imageKey: null } | { imageData: null; imageKey: string };

export type Participant = {
  connectionId: string; // 接続ごとのランダムな ID(通信の宛先)。端末 ID・IP ではない。退出で消える
  identity: ParticipantIdentity;
  joinedAt: number; // epoch ミリ秒
};

export type Room = {
  roomId: string;
  roomCode: string; // 4 桁
  geohash: string | null; // 6 文字、または位置なし
  createdAt: number; // epoch ミリ秒
  expiresAt: number; // createdAt + ROOM_RETENTION_MS
  participants: Participant[];
};

export type StoredDrawing = {
  drawingId: string;
  seq: number; // 部屋ごと、1 から、受理順
  sender: ParticipantIdentity;
  image: DrawingImage;
  createdAt: number;
};

/** 接続ごとの状態。呼び出し側が保存する(local-server はメモリ、Lambda は将来 DynamoDB) */
export type ConnectionState = {
  connectionId: string;
  geohash: string | null; // 一覧の購読に使う。位置なしは null
  roomId: string | null; // 参加中の部屋
};
