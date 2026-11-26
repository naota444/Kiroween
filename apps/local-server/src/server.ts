import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import {
  MAX_MESSAGE_BYTES,
  MemoryRoomStore,
  RoomService,
  SWEEP_INTERVAL_MS,
  orderRoomSummaries,
  parseClientMessage,
  selectListSubscribers,
  systemClock,
  type Clock,
  type ConnectionState,
  type ErrorCode,
  type ServerMessage,
} from '@doodle-nearby/core';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { ConnectionRegistry } from './connection-registry.js';
import { shortId, silentLogger, type Logger } from './logger.js';
import { createSerialQueue } from './serial-queue.js';

export const WS_PATH = '/ws';
/** ws が受け付けるフレームの上限。MAX_MESSAGE_BYTES の判定はこれより手前で自前で行う */
export const WS_MAX_PAYLOAD = 1024 * 1024;
export const HEARTBEAT_INTERVAL_MS = 30_000;

export type LocalServerOptions = {
  port: number;
  host?: string; // 既定 0.0.0.0
  logger?: Logger;
  clock?: Clock;
  /** 期限切れの部屋を掃除する間隔。既定は SWEEP_INTERVAL_MS */
  sweepIntervalMs?: number;
  /** ping を送る間隔(テスト用)。既定 30 秒 */
  heartbeatIntervalMs?: number;
};

export type LocalServer = {
  /** 実際に待ち受けているポート(port: 0 を指定したとき用) */
  readonly port: number;
  close(): Promise<void>;
};

const ERROR_TEXT: Partial<Record<ErrorCode, string>> = {
  invalid_json: 'The message is not valid JSON.',
  message_too_large: 'The message is too large.',
};

function rawToBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

export async function createLocalServer(options: LocalServerOptions): Promise<LocalServer> {
  const logger = options.logger ?? silentLogger;
  const clock = options.clock ?? systemClock;
  const heartbeatMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
  const sweepMs = options.sweepIntervalMs ?? SWEEP_INTERVAL_MS;

  const registry = new ConnectionRegistry<ConnectionState>();
  const queue = createSerialQueue();
  const alive = new WeakMap<WebSocket, boolean>();
  /** 部屋が増減したマス。キューの処理が終わったあとにまとめて一覧を再送する */
  const pendingGeohashes = new Set<string>();

  const sendRaw = (socket: WebSocket, message: ServerMessage): void => {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  };
  const sendError = (socket: WebSocket, code: ErrorCode, message?: string): void => {
    sendRaw(socket, { type: 'error', code, message: message ?? ERROR_TEXT[code] ?? 'Error.' });
  };

  const service = new RoomService({
    store: new MemoryRoomStore(),
    orderRooms: orderRoomSummaries,
    clock,
    ports: {
      send(connectionId, message) {
        const entry = registry.get(connectionId);
        if (entry) sendRaw(entry.socket, message);
      },
      // 呼ばれた時点では接続の状態がまだ古いので、キューの処理が終わってから再送する
      roomsChanged(geohash) {
        pendingGeohashes.add(geohash);
      },
    },
  });

  // 部屋が変わったマスの近隣でロビーにいる接続へ、最新の一覧を送る。同じマスの一覧は1回だけ作る
  const flushRoomsChanged = async (): Promise<void> => {
    const changed = [...pendingGeohashes];
    pendingGeohashes.clear();
    const lists = new Map<string, Promise<ServerMessage | null>>();
    for (const roomGeohash of changed) {
      const states = registry.all().map((entry) => entry.state);
      for (const state of selectListSubscribers(states, roomGeohash)) {
        const geohash = state.geohash;
        if (geohash === null) continue;
        let list = lists.get(geohash);
        if (!list) {
          list = service.buildRoomList(geohash).catch(() => null);
          lists.set(geohash, list);
        }
        const message = await list;
        const entry = registry.get(state.connectionId);
        if (message && entry) sendRaw(entry.socket, message);
      }
    }
  };

  const wss = new WebSocketServer({
    host: options.host ?? '0.0.0.0',
    port: options.port,
    path: WS_PATH,
    maxPayload: WS_MAX_PAYLOAD,
  });

  wss.on('error', () => logger.error('server error'));

  wss.on('connection', (socket) => {
    const connectionId = randomUUID();
    const initial: ConnectionState = { connectionId, geohash: null, roomId: null };
    registry.add(initial, socket);
    alive.set(socket, true);
    logger.info(`connected ${shortId(connectionId)}`);

    socket.on('pong', () => alive.set(socket, true));
    socket.on('error', () => logger.error(`socket error ${shortId(connectionId)}`));

    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        sendError(socket, 'invalid_json');
        return;
      }
      const buffer = rawToBuffer(data);
      if (buffer.byteLength > MAX_MESSAGE_BYTES) {
        sendError(socket, 'message_too_large');
        return;
      }
      const parsed = parseClientMessage(buffer.toString('utf8'));
      if (!parsed.ok) {
        sendError(socket, parsed.error.code, parsed.error.message);
        return;
      }
      const message = parsed.value;
      void queue
        .push(async () => {
          const entry = registry.get(connectionId);
          if (!entry) return;
          try {
            const next = await service.handleMessage(entry.state, message);
            registry.updateState(connectionId, next);
          } finally {
            await flushRoomsChanged();
          }
        })
        .catch(() => logger.error(`handler error ${shortId(connectionId)}`));
    });

    socket.on('close', () => {
      void queue
        .push(async () => {
          const entry = registry.get(connectionId);
          if (!entry) return;
          try {
            await service.handleDisconnect(entry.state);
          } finally {
            registry.remove(connectionId);
            await flushRoomsChanged();
          }
        })
        .catch(() => logger.error(`disconnect error ${shortId(connectionId)}`))
        .finally(() => logger.info(`disconnected ${shortId(connectionId)}`));
    });
  });

  // 生きている接続だけを残す。前回の ping に pong が返っていなければ切る
  const heartbeat = setInterval(() => {
    for (const { socket } of registry.all()) {
      if (alive.get(socket) === false) {
        socket.terminate();
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();

  // 期限切れの部屋の掃除も、他の処理と同じ直列キューで行う
  const sweep = setInterval(() => {
    void queue
      .push(async () => {
        try {
          await service.sweepExpired();
        } finally {
          await flushRoomsChanged();
        }
      })
      .catch(() => logger.error('sweep error'));
  }, sweepMs);
  sweep.unref();

  await new Promise<void>((resolve, reject) => {
    wss.once('listening', resolve);
    wss.once('error', reject);
  });
  const port = (wss.address() as AddressInfo).port;
  logger.info(`listening on port ${port}`);

  return {
    port,
    async close() {
      clearInterval(heartbeat);
      clearInterval(sweep);
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await queue.idle();
    },
  };
}
