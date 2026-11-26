import { systemClock, type Clock } from './clock.js';
import { neighborCells } from './geohash.js';
import {
  MAX_DRAWINGS_PER_ROOM,
  MAX_IMAGE_DATA_CHARS,
  MAX_PARTICIPANTS,
  MAX_ROOMS,
  type ClientMessage,
  type CreateRoom,
  type DrawingSubmit,
  type ErrorCode,
  type Join,
  type JoinByCode,
  type Leave,
  type ParticipantIdentity,
  type RoomList,
  type RoomSummary,
  type ServerMessage,
} from './messages.js';
import { pickIdentity } from './participant-identity.js';
import { isGeohash } from './parser.js';
import { ROOM_RETENTION_MS } from './room-constants.js';
import type { RoomStore } from './room-store.js';
import type { ConnectionState, DrawingImage, Room, StoredDrawing } from './room-types.js';

export interface ServicePorts {
  /** 接続へ 1 通送る。失敗(切断済みなど)は例外にせず、無視してよい */
  send(connectionId: string, message: ServerMessage): void | Promise<void>;
  /** この geohash の部屋が増減した。近隣を見ている接続へ一覧を再送してほしい */
  roomsChanged(geohash: string): void | Promise<void>;
}

/** Spec 0 の orderRoomSummaries と同じ形(構造的に定義し、room-list.ts に依存しない) */
export type OrderRoomSummaries = (
  candidates: { summary: RoomSummary; distance: number }[],
) => RoomSummary[];

export type RoomServiceOptions = {
  store: RoomStore;
  ports: ServicePorts;
  orderRooms: OrderRoomSummaries; // 注入。本番は core の orderRoomSummaries
  clock?: Clock; // 既定 systemClock
  random?: () => number; // 既定 Math.random。0 以上 1 未満
  newId?: () => string; // 既定 crypto.randomUUID
  retentionMs?: number; // 既定 ROOM_RETENTION_MS
  maxParticipants?: number; // 既定 MAX_PARTICIPANTS
  maxDrawings?: number; // 既定 MAX_DRAWINGS_PER_ROOM
  acceptImageKey?: boolean; // 既定 false
};

const CODE_RANDOM_TRIES = 20;
const CODE_FALLBACK_TRIES = 5;
const IDENTITY_TRIES = 5;

const ERROR_TEXT: Record<ErrorCode, string> = {
  invalid_json: 'The message is not valid JSON.',
  unknown_type: 'Unknown message type.',
  missing_field: 'A required field is missing.',
  invalid_field: 'A field has an invalid value.',
  message_too_large: 'The message is too large.',
  room_not_found: 'Room not found.',
  room_full: 'The room is full.',
  internal_error: 'Internal error.',
};

type Lookup = { by: 'id'; roomId: string } | { by: 'code'; roomCode: string };

/** 参加の結果。state は呼び出し後の接続状態 */
type JoinOutcome = { state: ConnectionState };

export class RoomService {
  private readonly store: RoomStore;
  private readonly ports: ServicePorts;
  private readonly orderRooms: OrderRoomSummaries;
  private readonly clock: Clock;
  private readonly random: () => number;
  private readonly newId: () => string;
  private readonly retentionMs: number;
  private readonly maxParticipants: number;
  private readonly maxDrawings: number;
  private readonly acceptImageKey: boolean;

  constructor(options: RoomServiceOptions) {
    this.store = options.store;
    this.ports = options.ports;
    this.orderRooms = options.orderRooms;
    this.clock = options.clock ?? systemClock;
    this.random = options.random ?? Math.random;
    this.newId = options.newId ?? (() => crypto.randomUUID());
    this.retentionMs = options.retentionMs ?? ROOM_RETENTION_MS;
    this.maxParticipants = options.maxParticipants ?? MAX_PARTICIPANTS;
    this.maxDrawings = options.maxDrawings ?? MAX_DRAWINGS_PER_ROOM;
    this.acceptImageKey = options.acceptImageKey ?? false;
  }

  /** 1 通を処理し、新しい接続状態を返す。例外を投げない(エラーは ErrorMessage として送信者へ送る) */
  async handleMessage(state: ConnectionState, message: ClientMessage): Promise<ConnectionState> {
    try {
      switch (message.type) {
        case 'join':
          return await this.handleJoin(state, message);
        case 'join_by_code':
          return await this.handleJoinByCode(state, message);
        case 'create_room':
          return await this.handleCreateRoom(state, message);
        case 'leave':
          return await this.handleLeave(state, message);
        case 'drawing_submit':
          return await this.handleDrawingSubmit(state, message);
        default: {
          const unreachable: never = message;
          void unreachable;
          return state;
        }
      }
    } catch {
      await this.sendError(state.connectionId, 'internal_error');
      return state;
    }
  }

  /** 切断。Leave と同じ後始末をし、切断した接続には何も送らない */
  async handleDisconnect(state: ConnectionState): Promise<void> {
    if (state.roomId === null) return;
    try {
      await this.leaveRoom(state.connectionId, state.roomId);
    } catch {
      // 切断済みの接続へは何も返せない
    }
  }

  /** 一覧を作る。geohash が不正なら InvalidGeohashError(neighborCells が投げる) */
  async buildRoomList(geohash: string): Promise<RoomList> {
    const now = this.clock.now();
    const rooms = await this.store.listRoomsByGeohashes(neighborCells(geohash));
    const candidates: { summary: RoomSummary; distance: number }[] = [];
    for (const room of rooms) {
      if (room.geohash === null || room.expiresAt <= now) continue;
      const distance = room.geohash === geohash ? 0 : 1;
      candidates.push({
        summary: {
          roomId: room.roomId,
          roomCode: room.roomCode,
          geohash: room.geohash,
          participantCount: room.participants.length,
          sameHash: distance === 0,
        },
        distance,
      });
    }
    return { type: 'room_list', rooms: this.orderRooms(candidates).slice(0, MAX_ROOMS) };
  }

  // ---- メッセージごとの処理 ----

  /** Delete expired rooms, notify each affected geohash once, return the number deleted. */
  async sweepExpired(): Promise<number> {
    const deleted = await this.store.deleteExpired(this.clock.now());
    const geohashes = new Set<string>();
    for (const room of deleted) {
      if (room.geohash !== null) geohashes.add(room.geohash);
    }
    for (const geohash of geohashes) await this.notifyChanged(geohash);
    return deleted.length;
  }

  private async handleJoin(state: ConnectionState, message: Join): Promise<ConnectionState> {
    if (!isGeohash(message.geohash)) return this.fail(state, 'invalid_field');

    if (message.roomId === null && message.roomCode === null) {
      // 一覧の購読(一覧の本実装は 4.7)。参加中の部屋は変えない。
      const next = { ...state, geohash: message.geohash };
      await this.send(state.connectionId, await this.buildRoomList(message.geohash));
      return next;
    }

    const lookup: Lookup =
      message.roomId !== null
        ? { by: 'id', roomId: message.roomId } // roomId が先。roomCode は無視する
        : { by: 'code', roomCode: message.roomCode ?? '' };
    const outcome = await this.joinRoom(state, lookup, message.geohash);
    return outcome.state;
  }

  private async handleJoinByCode(
    state: ConnectionState,
    message: JoinByCode,
  ): Promise<ConnectionState> {
    const outcome = await this.joinRoom(
      state,
      { by: 'code', roomCode: message.roomCode },
      state.geohash,
    );
    return outcome.state;
  }

  private async handleCreateRoom(
    state: ConnectionState,
    message: CreateRoom,
  ): Promise<ConnectionState> {
    if (message.geohash !== null && !isGeohash(message.geohash)) {
      return this.fail(state, 'invalid_field');
    }
    const room = await this.allocateRoom(message.geohash);
    if (room === null) return this.fail(state, 'internal_error');

    await this.send(state.connectionId, {
      type: 'room_created',
      roomId: room.roomId,
      roomCode: room.roomCode,
    });
    if (room.geohash !== null) await this.notifyChanged(room.geohash);

    const nextGeohash = message.geohash ?? state.geohash;
    const outcome = await this.joinRoom(state, { by: 'id', roomId: room.roomId }, nextGeohash);
    return outcome.state;
  }

  private async handleLeave(state: ConnectionState, message: Leave): Promise<ConnectionState> {
    if (state.roomId === null || state.roomId !== message.roomId) {
      return this.fail(state, 'invalid_field');
    }
    await this.leaveRoom(state.connectionId, message.roomId);
    await this.send(state.connectionId, { type: 'room_left', roomId: message.roomId });
    return { ...state, roomId: null };
  }

  /** 絵の受理と配布。エラーは送信者だけに返し、保存も配布もしない */
  private async handleDrawingSubmit(
    state: ConnectionState,
    message: DrawingSubmit,
  ): Promise<ConnectionState> {
    const room = await this.findRoom({ by: 'id', roomId: message.roomId });
    if (room === null) return this.fail(state, 'room_not_found');

    const sender = room.participants.find((p) => p.connectionId === state.connectionId);
    if (sender === undefined) return this.fail(state, 'invalid_field');

    if (message.imageKey !== null && !this.acceptImageKey) {
      return this.fail(state, 'invalid_field');
    }
    // PNG の中身は調べない。長さだけを見る
    if (message.imageData !== null && message.imageData.length > MAX_IMAGE_DATA_CHARS) {
      return this.fail(state, 'message_too_large');
    }

    const image: DrawingImage =
      message.imageData !== null
        ? { imageData: message.imageData, imageKey: null }
        : { imageData: null, imageKey: message.imageKey ?? '' };
    const appended = await this.store.appendDrawing(
      room.roomId,
      {
        drawingId: this.newId(),
        sender: sender.identity,
        image,
        createdAt: this.clock.now(),
      },
      this.maxDrawings,
    );
    if (!appended.ok) return this.fail(state, 'room_not_found');

    const added = drawingAdded(room.roomId, appended.drawing);
    for (const participant of room.participants) {
      await this.send(participant.connectionId, added);
    }
    return state;
  }

  // ---- 共通処理 ----

  /** 参加の手順(Join / JoinByCode / CreateRoom 共通) */
  private async joinRoom(
    state: ConnectionState,
    lookup: Lookup,
    geohash: string | null,
  ): Promise<JoinOutcome> {
    const connectionId = state.connectionId;
    let room = await this.findRoom(lookup);
    if (room === null) return { state: await this.fail(state, 'room_not_found') };

    // 再参加: 人数を変えずに room_joined と絵を再送する
    const existing = room.participants.find((p) => p.connectionId === connectionId);
    if (existing && state.roomId === room.roomId) {
      const next = { connectionId, geohash, roomId: room.roomId };
      await this.sendJoinConfirmation(room, existing.identity, connectionId);
      return { state: next };
    }

    if (room.participants.length >= this.maxParticipants && !existing) {
      return { state: await this.fail(state, 'room_full') };
    }

    // 別の部屋に参加中なら、その部屋から外す
    let current = state;
    if (state.roomId !== null && state.roomId !== room.roomId) {
      await this.leaveRoom(connectionId, state.roomId);
      current = { ...state, roomId: null };
    }

    for (let attempt = 0; attempt < IDENTITY_TRIES; attempt += 1) {
      if (attempt > 0) {
        const reloaded = await this.findRoom({ by: 'id', roomId: room.roomId });
        if (reloaded === null) return { state: await this.fail(current, 'room_not_found') };
        room = reloaded;
      }
      const identity = pickIdentity(
        room.participants.map((p) => p.identity),
        this.random,
      );
      if (identity === null) return { state: await this.fail(current, 'internal_error') };

      const result = await this.store.addParticipant(
        room.roomId,
        { connectionId, identity, joinedAt: this.clock.now() },
        this.maxParticipants,
      );
      if (!result.ok) {
        if (result.reason === 'identity_taken') continue;
        return {
          state: await this.fail(
            current,
            result.reason === 'full' ? 'room_full' : 'room_not_found',
          ),
        };
      }

      const joined = result.room;
      const self = joined.participants.find((p) => p.connectionId === connectionId);
      const you = self?.identity ?? identity;
      const next = { connectionId, geohash, roomId: joined.roomId };

      await this.sendJoinConfirmation(joined, you, connectionId);
      if (result.added) {
        for (const other of joined.participants) {
          if (other.connectionId === connectionId) continue;
          await this.send(other.connectionId, {
            type: 'participant_joined',
            roomId: joined.roomId,
            participant: you,
          });
        }
        if (joined.geohash !== null) await this.notifyChanged(joined.geohash);
      }
      return { state: next };
    }
    return { state: await this.fail(current, 'internal_error') };
  }

  /** room_joined を送り、保持している絵を seq の昇順で drawing_added として送る */
  private async sendJoinConfirmation(
    room: Room,
    you: ParticipantIdentity,
    connectionId: string,
  ): Promise<void> {
    await this.send(connectionId, {
      type: 'room_joined',
      roomId: room.roomId,
      roomCode: room.roomCode,
      you,
      participants: room.participants.map((p) => p.identity),
    });
    const drawings = await this.store.listDrawings(room.roomId);
    for (const drawing of [...drawings].sort((a, b) => a.seq - b.seq)) {
      await this.send(connectionId, drawingAdded(room.roomId, drawing));
    }
  }

  /** 部屋から外し、participant_left と roomsChanged を送る。room_left は送らない */
  private async leaveRoom(connectionId: string, roomId: string): Promise<void> {
    const before = await this.store.getRoomById(roomId);
    if (before === null) return;
    const leaver = before.participants.find((p) => p.connectionId === connectionId);
    const after = await this.store.removeParticipant(roomId, connectionId);
    if (leaver === undefined) return;
    if (after !== null) {
      for (const other of after.participants) {
        await this.send(other.connectionId, {
          type: 'participant_left',
          roomId,
          participant: leaver.identity,
        });
      }
    }
    if (before.geohash !== null) await this.notifyChanged(before.geohash);
  }

  /** 期限切れ(expiresAt <= now)は、ないものとして扱う */
  private async findRoom(lookup: Lookup): Promise<Room | null> {
    const room =
      lookup.by === 'id'
        ? await this.store.getRoomById(lookup.roomId)
        : await this.store.getRoomByCode(lookup.roomCode);
    if (room === null || room.expiresAt <= this.clock.now()) return null;
    return room;
  }

  /** 部屋番号を払い出して部屋を作る。作れなければ null */
  private async allocateRoom(geohash: string | null): Promise<Room | null> {
    const now = this.clock.now();
    const roomId = this.newId();
    const build = (roomCode: string): Room => ({
      roomId,
      roomCode,
      geohash,
      createdAt: now,
      expiresAt: now + this.retentionMs,
      participants: [],
    });

    for (let i = 0; i < CODE_RANDOM_TRIES; i += 1) {
      const room = build(this.randomCode());
      const result = await this.store.createRoom(room, now);
      if (result.ok) return room;
    }
    for (let i = 0; i < CODE_FALLBACK_TRIES; i += 1) {
      const free = this.freeCodes(await this.store.listActiveRoomCodes(now));
      if (free.length === 0) return null;
      const room = build(free[this.randomIndex(free.length)] ?? '');
      const result = await this.store.createRoom(room, now);
      if (result.ok) return room;
    }
    return null;
  }

  private freeCodes(used: readonly string[]): string[] {
    const taken = new Set(used);
    const free: string[] = [];
    for (let n = 0; n < 10_000; n += 1) {
      const code = String(n).padStart(4, '0');
      if (!taken.has(code)) free.push(code);
    }
    return free;
  }

  private randomIndex(length: number): number {
    return Math.min(length - 1, Math.max(0, Math.floor(this.random() * length)));
  }

  private randomCode(): string {
    return String(this.randomIndex(10_000)).padStart(4, '0');
  }

  private async fail(state: ConnectionState, code: ErrorCode): Promise<ConnectionState> {
    await this.sendError(state.connectionId, code);
    return state;
  }

  private sendError(connectionId: string, code: ErrorCode): Promise<void> {
    return this.send(connectionId, { type: 'error', code, message: ERROR_TEXT[code] });
  }

  /** 送信の失敗は無視する */
  private async send(connectionId: string, message: ServerMessage): Promise<void> {
    try {
      await this.ports.send(connectionId, message);
    } catch {
      // 切断済みなど
    }
  }

  private async notifyChanged(geohash: string): Promise<void> {
    try {
      await this.ports.roomsChanged(geohash);
    } catch {
      // 一覧の再送の失敗は、部屋の処理を止めない
    }
  }
}

/**
 * 部屋の増減のあとに一覧を再送する接続を選ぶ純関数。
 * 部屋に参加中でなく、位置があり、その位置の周囲(自分のマス + 8マス)に roomGeohash が含まれる接続。
 */
export function selectListSubscribers<T extends ConnectionState>(
  connections: readonly T[],
  roomGeohash: string,
): T[] {
  return connections.filter((connection) => {
    if (connection.roomId !== null || connection.geohash === null) return false;
    if (!isGeohash(connection.geohash)) return false;
    return neighborCells(connection.geohash).includes(roomGeohash);
  });
}

function drawingAdded(roomId: string, drawing: StoredDrawing): ServerMessage {
  const base = {
    type: 'drawing_added' as const,
    roomId,
    drawingId: drawing.drawingId,
    seq: drawing.seq,
    sender: drawing.sender,
  };
  return drawing.image.imageData !== null
    ? { ...base, imageData: drawing.image.imageData, imageKey: null }
    : { ...base, imageData: null, imageKey: drawing.image.imageKey };
}
