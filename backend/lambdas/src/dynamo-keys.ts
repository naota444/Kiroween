// DynamoDB のキー・項目の変換・UpdateItem の式を組み立てる純関数。AWS SDK は import しない。
// 項目の形は design.md「1.2 項目」、式は「1.3 RoomStore の各メソッドの写し方」、TTL は「1.4 TTL」。
import type {
  AddParticipantResult,
  ConnectionState,
  DrawingImage,
  Participant,
  ParticipantIdentity,
  Room,
  StoredDrawing,
} from '@doodle-nearby/core';
import { CONNECTION_TTL_SECONDS, TTL_MARGIN_SECONDS } from './ttl-constants.js';

// ---------- キー ----------

export type ItemKey = { pk: string; sk: string };

const ROOM_PREFIX = 'ROOM#';
const DRAWING_PREFIX = 'DRAWING#';
const CODE_PREFIX = 'CODE#';
const CONN_PREFIX = 'CONN#';
const GEO_PREFIX = 'GEO#';
const SEQ_DIGITS = 10;

/** seq を 10 桁のゼロ埋めにする(sk の辞書順を seq の順にそろえる) */
export function padSeq(seq: number): string {
  if (!Number.isInteger(seq) || seq < 0 || seq >= 10 ** SEQ_DIGITS) {
    throw new RangeError(`seq は 0 以上 ${10 ** SEQ_DIGITS} 未満の整数: ${seq}`);
  }
  return String(seq).padStart(SEQ_DIGITS, '0');
}

export function roomKey(roomId: string): ItemKey {
  return { pk: `${ROOM_PREFIX}${roomId}`, sk: 'META' };
}

export function drawingKey(roomId: string, seq: number): ItemKey {
  return { pk: `${ROOM_PREFIX}${roomId}`, sk: `${DRAWING_PREFIX}${padSeq(seq)}` };
}

export function codeKey(roomCode: string): ItemKey {
  return { pk: `${CODE_PREFIX}${roomCode}`, sk: 'LOCK' };
}

export function connectionKey(connectionId: string): ItemKey {
  return { pk: `${CONN_PREFIX}${connectionId}`, sk: 'STATE' };
}

/** GSI(gsi1pk)の値 */
export function geoPartition(geohash: string): string {
  return `${GEO_PREFIX}${geohash}`;
}

/** 絵の項目を Query するときの sk の接頭辞 */
export const DRAWING_SK_PREFIX = DRAWING_PREFIX;
/** GSI で部屋 / 接続を分けて引くときの gsi1sk の接頭辞 */
export const GSI_ROOM_SK_PREFIX = ROOM_PREFIX;
export const GSI_CONN_SK_PREFIX = CONN_PREFIX;

function stripPrefix(value: string, prefix: string): string {
  if (!value.startsWith(prefix)) throw new Error(`キーの接頭辞が ${prefix} ではない: ${value}`);
  return value.slice(prefix.length);
}

// ---------- TTL(秒) ----------

/** 部屋・絵・予約: ceil(expiresAt / 1000) + TTL_MARGIN_SECONDS */
export function roomTtl(expiresAt: number): number {
  return Math.ceil(expiresAt / 1000) + TTL_MARGIN_SECONDS;
}

/** 接続状態: floor(now / 1000) + CONNECTION_TTL_SECONDS */
export function connectionTtl(now: number): number {
  return Math.floor(now / 1000) + CONNECTION_TTL_SECONDS;
}

// ---------- 識別 ----------

/** identities(String Set)の要素。`color:icon` */
export function identityToken(identity: ParticipantIdentity): string {
  return `${identity.color}:${identity.icon}`;
}

// ---------- 項目の型 ----------

type GsiKeys = { gsi1pk?: string; gsi1sk?: string };

export type ParticipantEntry = { color: string; icon: string; joinedAt: number };

export type RoomItem = ItemKey &
  GsiKeys & {
    roomCode: string;
    geohash?: string;
    createdAt: number;
    expiresAt: number;
    participants: Record<string, ParticipantEntry>;
    /** 参加者が 0 人のときは省略する(DynamoDB の Set は空にできない) */
    identities?: Set<string>;
    nextSeq: number;
    ttl: number;
  };

export type DrawingItem = ItemKey & {
  drawingId: string;
  seq: number;
  sender: { color: string; icon: string };
  /** imageData か imageKey のどちらか一方だけを持つ */
  imageData?: string;
  imageKey?: string;
  createdAt: number;
  ttl: number;
};

export type CodeLockItem = ItemKey & { roomId: string; expiresAt: number; ttl: number };

export type ConnectionItem = ItemKey &
  GsiKeys & {
    geohash?: string;
    roomId?: string;
    ttl: number;
  };

// ---------- 項目 ↔ 型 ----------

/**
 * Room を項目にする。nextSeq は新しい部屋なら 0。
 * geohash が null なら geohash と GSI キーを省略する。参加者が 0 人なら identities を省略する。
 */
export function roomToItem(room: Room, nextSeq: number): RoomItem {
  const participants = Object.fromEntries(
    room.participants.map((p): [string, ParticipantEntry] => [
      p.connectionId,
      { color: p.identity.color, icon: p.identity.icon, joinedAt: p.joinedAt },
    ]),
  );
  const item: RoomItem = {
    ...roomKey(room.roomId),
    roomCode: room.roomCode,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    participants,
    nextSeq,
    ttl: roomTtl(room.expiresAt),
  };
  if (room.geohash !== null) {
    item.geohash = room.geohash;
    item.gsi1pk = geoPartition(room.geohash);
    item.gsi1sk = `${ROOM_PREFIX}${room.roomId}`;
  }
  if (room.participants.length > 0) {
    item.identities = new Set(room.participants.map((p) => identityToken(p.identity)));
  }
  return item;
}

/**
 * 項目を Room にする。参加者は participants の Map から作る(identities は読まない)。
 * 並びは joinedAt の昇順、同じ値なら connectionId の昇順。
 */
export function itemToRoom(item: RoomItem): Room {
  const participants: Participant[] = Object.entries(item.participants)
    .map(([connectionId, entry]) => ({
      connectionId,
      identity: { color: entry.color, icon: entry.icon } as ParticipantIdentity,
      joinedAt: entry.joinedAt,
    }))
    .sort((a, b) => a.joinedAt - b.joinedAt || compareStrings(a.connectionId, b.connectionId));
  return {
    roomId: stripPrefix(item.pk, ROOM_PREFIX),
    roomCode: item.roomCode,
    geohash: item.geohash ?? null,
    createdAt: item.createdAt,
    expiresAt: item.expiresAt,
    participants,
  };
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** ttl(秒)は appendDrawing の ALL_NEW で得た部屋の ttl をそのまま渡す */
export function drawingToItem(roomId: string, drawing: StoredDrawing, ttl: number): DrawingItem {
  const item: DrawingItem = {
    ...drawingKey(roomId, drawing.seq),
    drawingId: drawing.drawingId,
    seq: drawing.seq,
    sender: { color: drawing.sender.color, icon: drawing.sender.icon },
    createdAt: drawing.createdAt,
    ttl,
  };
  if (drawing.image.imageData !== null) item.imageData = drawing.image.imageData;
  else item.imageKey = drawing.image.imageKey;
  return item;
}

export function itemToDrawing(item: DrawingItem): StoredDrawing {
  let image: DrawingImage;
  if (item.imageData !== undefined) image = { imageData: item.imageData, imageKey: null };
  else if (item.imageKey !== undefined) image = { imageData: null, imageKey: item.imageKey };
  else throw new Error(`絵の項目に imageData も imageKey もない: ${item.pk} ${item.sk}`);
  return {
    drawingId: item.drawingId,
    seq: item.seq,
    sender: { color: item.sender.color, icon: item.sender.icon } as ParticipantIdentity,
    image,
    createdAt: item.createdAt,
  };
}

/** 部屋番号の予約項目。ttl は部屋と同じ式 */
export function codeLockToItem(room: Room): CodeLockItem {
  return {
    ...codeKey(room.roomCode),
    roomId: room.roomId,
    expiresAt: room.expiresAt,
    ttl: roomTtl(room.expiresAt),
  };
}

/** GSI キーは、geohash があり、かつ roomId がないときだけ付ける(スパース) */
export function connectionToItem(state: ConnectionState, now: number): ConnectionItem {
  const item: ConnectionItem = { ...connectionKey(state.connectionId), ttl: connectionTtl(now) };
  if (state.geohash !== null) item.geohash = state.geohash;
  if (state.roomId !== null) item.roomId = state.roomId;
  if (state.geohash !== null && state.roomId === null) {
    item.gsi1pk = geoPartition(state.geohash);
    item.gsi1sk = `${CONN_PREFIX}${state.connectionId}`;
  }
  return item;
}

export function itemToConnection(item: ConnectionItem): ConnectionState {
  return {
    connectionId: stripPrefix(item.pk, CONN_PREFIX),
    geohash: item.geohash ?? null,
    roomId: item.roomId ?? null,
  };
}

// ---------- UpdateItem の式 ----------
// 属性名はすべて #名前 のプレースホルダーで渡す(ttl などの予約語を避け、接続 ID を式に埋め込まない)。
// ExpressionAttributeNames / Values には、式で使ったものだけを入れる(余分があると DynamoDB が拒否する)。

export type UpdateParts = {
  UpdateExpression: string;
  ConditionExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, string | number | Set<string> | ParticipantEntry>;
};

/**
 * 条件: 部屋がある、まだ参加していない、定員未満、同じ識別がいない。
 * 失敗時の理由は classifyAddParticipantFailure で決める。
 */
export function buildAddParticipantUpdate(
  participant: Participant,
  maxParticipants: number,
): UpdateParts {
  const token = identityToken(participant.identity);
  return {
    UpdateExpression: 'SET #participants.#c = :p ADD #identities :idset',
    ConditionExpression:
      'attribute_exists(#pk) AND attribute_not_exists(#participants.#c)' +
      ' AND size(#participants) < :max AND NOT contains(#identities, :id)',
    ExpressionAttributeNames: {
      '#pk': 'pk',
      '#participants': 'participants',
      '#identities': 'identities',
      '#c': participant.connectionId,
    },
    ExpressionAttributeValues: {
      ':p': {
        color: participant.identity.color,
        icon: participant.identity.icon,
        joinedAt: participant.joinedAt,
      },
      ':idset': new Set([token]),
      ':id': token,
      ':max': maxParticipants,
    },
  };
}

/**
 * 条件: その接続が参加者である。identity は、読み取った項目にある、その接続の識別。
 * 最後の 1 人を外すと、DynamoDB が identities 属性ごと消す。
 */
export function buildRemoveParticipantUpdate(
  connectionId: string,
  identity: ParticipantIdentity,
): UpdateParts {
  return {
    UpdateExpression: 'REMOVE #participants.#c DELETE #identities :idset',
    ConditionExpression: 'attribute_exists(#participants.#c)',
    ExpressionAttributeNames: {
      '#participants': 'participants',
      '#identities': 'identities',
      '#c': connectionId,
    },
    ExpressionAttributeValues: { ':idset': new Set([identityToken(identity)]) },
  };
}

/** nextSeq を 1 加算する。ReturnValues: ALL_NEW で seq と ttl を得る */
export function buildAppendDrawingUpdate(): UpdateParts {
  return {
    UpdateExpression: 'ADD #nextSeq :one',
    ConditionExpression: 'attribute_exists(#pk)',
    ExpressionAttributeNames: { '#pk': 'pk', '#nextSeq': 'nextSeq' },
    ExpressionAttributeValues: { ':one': 1 },
  };
}

/**
 * addParticipant の条件が失敗したとき、ALL_OLD の項目(なければ undefined)から結果を決める。
 * 順序は MemoryRoomStore と同じ: 項目なし → すでに参加 → 満員 → 識別の重複。
 */
export function classifyAddParticipantFailure(
  oldItem: RoomItem | undefined,
  participant: Participant,
  maxParticipants: number,
): AddParticipantResult {
  if (oldItem === undefined) return { ok: false, reason: 'not_found' };
  if (Object.hasOwn(oldItem.participants, participant.connectionId)) {
    return { ok: true, room: itemToRoom(oldItem), added: false };
  }
  if (Object.keys(oldItem.participants).length >= maxParticipants) {
    return { ok: false, reason: 'full' };
  }
  return { ok: false, reason: 'identity_taken' };
}
