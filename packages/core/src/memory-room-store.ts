import type {
  AddParticipantResult,
  AppendDrawingResult,
  CreateRoomResult,
  DeletedRoom,
  NewDrawing,
  RoomStore,
} from './room-store.js';
import type { Participant, Room, StoredDrawing } from './room-types.js';

type Entry = { room: Room; drawings: StoredDrawing[]; nextSeq: number };

function copyRoom(room: Room): Room {
  return {
    ...room,
    participants: room.participants.map((p) => ({ ...p, identity: { ...p.identity } })),
  };
}

function copyDrawing(d: StoredDrawing): StoredDrawing {
  return { ...d, sender: { ...d.sender }, image: { ...d.image } as StoredDrawing['image'] };
}

/**
 * メモリ上の RoomStore。各メソッドは await を挟まず同期的に判定と更新を行う(原子性)。
 * 名前・IP・端末 ID・緯度経度は持たない。
 */
export class MemoryRoomStore implements RoomStore {
  private readonly byId = new Map<string, Entry>();
  private readonly idByCode = new Map<string, string>();

  createRoom(room: Room, now: number): Promise<CreateRoomResult> {
    const existingId = this.idByCode.get(room.roomCode);
    if (existingId !== undefined) {
      const existing = this.byId.get(existingId);
      if (existing && existing.room.expiresAt > now) {
        return Promise.resolve({ ok: false, reason: 'code_taken' });
      }
      this.remove(existingId);
    }
    this.byId.set(room.roomId, { room: copyRoom(room), drawings: [], nextSeq: 1 });
    this.idByCode.set(room.roomCode, room.roomId);
    return Promise.resolve({ ok: true });
  }

  getRoomById(roomId: string): Promise<Room | null> {
    const entry = this.byId.get(roomId);
    return Promise.resolve(entry ? copyRoom(entry.room) : null);
  }

  getRoomByCode(roomCode: string): Promise<Room | null> {
    const id = this.idByCode.get(roomCode);
    const entry = id === undefined ? undefined : this.byId.get(id);
    return Promise.resolve(entry ? copyRoom(entry.room) : null);
  }

  listRoomsByGeohashes(geohashes: readonly string[]): Promise<Room[]> {
    const wanted = new Set(geohashes);
    const rooms: Room[] = [];
    for (const { room } of this.byId.values()) {
      if (room.geohash !== null && wanted.has(room.geohash)) rooms.push(copyRoom(room));
    }
    return Promise.resolve(rooms);
  }

  listActiveRoomCodes(now: number): Promise<string[]> {
    const codes: string[] = [];
    for (const { room } of this.byId.values()) {
      if (room.expiresAt > now) codes.push(room.roomCode);
    }
    return Promise.resolve(codes);
  }

  addParticipant(
    roomId: string,
    participant: Participant,
    maxParticipants: number,
  ): Promise<AddParticipantResult> {
    const entry = this.byId.get(roomId);
    if (!entry) return Promise.resolve({ ok: false, reason: 'not_found' });
    const { room } = entry;
    if (room.participants.some((p) => p.connectionId === participant.connectionId)) {
      return Promise.resolve({ ok: true, room: copyRoom(room), added: false });
    }
    if (room.participants.length >= maxParticipants) {
      return Promise.resolve({ ok: false, reason: 'full' });
    }
    if (
      room.participants.some(
        (p) =>
          p.identity.color === participant.identity.color &&
          p.identity.icon === participant.identity.icon,
      )
    ) {
      return Promise.resolve({ ok: false, reason: 'identity_taken' });
    }
    room.participants.push({ ...participant, identity: { ...participant.identity } });
    return Promise.resolve({ ok: true, room: copyRoom(room), added: true });
  }

  removeParticipant(roomId: string, connectionId: string): Promise<Room | null> {
    const entry = this.byId.get(roomId);
    if (!entry) return Promise.resolve(null);
    entry.room.participants = entry.room.participants.filter(
      (p) => p.connectionId !== connectionId,
    );
    return Promise.resolve(copyRoom(entry.room));
  }

  appendDrawing(
    roomId: string,
    drawing: NewDrawing,
    maxDrawings: number,
  ): Promise<AppendDrawingResult> {
    const entry = this.byId.get(roomId);
    if (!entry) return Promise.resolve({ ok: false, reason: 'not_found' });
    const stored: StoredDrawing = copyDrawing({ ...drawing, seq: entry.nextSeq });
    entry.nextSeq += 1;
    entry.drawings.push(stored);
    if (entry.drawings.length > maxDrawings) {
      entry.drawings.splice(0, entry.drawings.length - Math.max(0, maxDrawings));
    }
    return Promise.resolve({ ok: true, drawing: copyDrawing(stored) });
  }

  listDrawings(roomId: string): Promise<StoredDrawing[]> {
    const entry = this.byId.get(roomId);
    return Promise.resolve(entry ? entry.drawings.map(copyDrawing) : []);
  }

  deleteExpired(now: number): Promise<DeletedRoom[]> {
    const deleted: DeletedRoom[] = [];
    for (const [roomId, { room }] of [...this.byId]) {
      if (room.expiresAt <= now) {
        deleted.push({ roomId, geohash: room.geohash });
        this.remove(roomId);
      }
    }
    return Promise.resolve(deleted);
  }

  private remove(roomId: string): void {
    const entry = this.byId.get(roomId);
    if (!entry) return;
    this.byId.delete(roomId);
    if (this.idByCode.get(entry.room.roomCode) === roomId) {
      this.idByCode.delete(entry.room.roomCode);
    }
  }
}
