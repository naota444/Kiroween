import type { ServerMessage } from '../messages.js';
import { orderRoomSummaries } from '../room-list.js';
import type { OrderRoomSummaries, ServicePorts } from '../room-service.js';

export type SentMessage = { to: string; message: ServerMessage };

export type FakePorts = ServicePorts & {
  sent: SentMessage[];
  changed: string[];
  /** 接続宛てに送られたメッセージ */
  messagesTo(connectionId: string): ServerMessage[];
  clear(): void;
};

/** 送られたメッセージと roomsChanged の geohash を記録する偽の ServicePorts */
export function createFakePorts(): FakePorts {
  const sent: SentMessage[] = [];
  const changed: string[] = [];
  return {
    sent,
    changed,
    send(connectionId, message) {
      sent.push({ to: connectionId, message });
    },
    roomsChanged(geohash) {
      changed.push(geohash);
    },
    messagesTo(connectionId) {
      return sent.filter((s) => s.to === connectionId).map((s) => s.message);
    },
    clear() {
      sent.length = 0;
      changed.length = 0;
    },
  };
}

/** 並べ替え。本番と同じ core の orderRoomSummaries を使う(テスト側の既存名を維持) */
export const simpleOrderRooms: OrderRoomSummaries = orderRoomSummaries;

/** 種付きの乱数(mulberry32)。0 以上 1 未満 */
export function createSeededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 連番の ID(prefix-1, prefix-2, ...) */
export function createSequentialIds(prefix = 'id'): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}
