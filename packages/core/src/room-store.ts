import type { Participant, Room, StoredDrawing } from './room-types.js';

export type CreateRoomResult = { ok: true } | { ok: false; reason: 'code_taken' };
export type AddParticipantResult =
  | { ok: true; room: Room; added: boolean } // added=false: すでに参加者(変更なし)
  | { ok: false; reason: 'not_found' | 'full' | 'identity_taken' };
export type NewDrawing = Omit<StoredDrawing, 'seq'>;
export type AppendDrawingResult =
  { ok: true; drawing: StoredDrawing } | { ok: false; reason: 'not_found' };
export type DeletedRoom = { roomId: string; geohash: string | null };

export interface RoomStore {
  /** 期限切れでない部屋が同じ roomCode を持つなら code_taken。期限切れの同じ roomCode の部屋は、置き換える(その部屋と絵を消す) */
  createRoom(room: Room, now: number): Promise<CreateRoomResult>;
  /** 期限切れかどうかは判定しない(呼び出し側が expiresAt で判定する) */
  getRoomById(roomId: string): Promise<Room | null>;
  getRoomByCode(roomCode: string): Promise<Room | null>;
  /** geohashes は 1〜9 個。geohash が null の部屋は返らない。期限切れも返りうる */
  listRoomsByGeohashes(geohashes: readonly string[]): Promise<Room[]>;
  /** 期限切れでない部屋の roomCode(部屋番号の払い出し用) */
  listActiveRoomCodes(now: number): Promise<string[]>;
  /** 原子的。同じ connectionId がいれば added=false で成功。満員なら full、同じ識別がいれば identity_taken */
  addParticipant(
    roomId: string,
    participant: Participant,
    maxParticipants: number,
  ): Promise<AddParticipantResult>;
  /** 更新後の部屋、または部屋がなければ null。参加者でなくても失敗しない */
  removeParticipant(roomId: string, connectionId: string): Promise<Room | null>;
  /** 原子的。seq を割り当て、maxDrawings を超えた古い絵を捨てる */
  appendDrawing(
    roomId: string,
    drawing: NewDrawing,
    maxDrawings: number,
  ): Promise<AppendDrawingResult>;
  /** seq の昇順(古い順) */
  listDrawings(roomId: string): Promise<StoredDrawing[]>;
  /** now 以前に期限切れの部屋と、その絵・参加者を消す。消した部屋を返す。roomCode は再利用できる */
  deleteExpired(now: number): Promise<DeletedRoom[]>;
}
