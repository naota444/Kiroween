import { MAX_MESSAGE_BYTES, type ServerMessage } from '@doodle-nearby/core';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createLocalServer, type LocalServer } from './server.js';

let server: LocalServer | undefined;
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.terminate();
  await server?.close();
  server = undefined;
});

async function connect(port: number): Promise<WebSocket> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
  return socket;
}

function nextMessage(socket: WebSocket): Promise<ServerMessage> {
  return new Promise((resolve) => {
    socket.once('message', (data) => resolve(JSON.parse(String(data)) as ServerMessage));
  });
}

describe('createLocalServer', () => {
  it('broken JSON returns invalid_json and keeps the connection open', async () => {
    server = await createLocalServer({ port: 0, host: '127.0.0.1' });
    const socket = await connect(server.port);

    const reply = nextMessage(socket);
    socket.send('{not json');
    expect(await reply).toMatchObject({ type: 'error', code: 'invalid_json' });
    expect(socket.readyState).toBe(WebSocket.OPEN);

    // 接続は生きていて、次の正しいメッセージも処理される
    const second = nextMessage(socket);
    socket.send(JSON.stringify({ type: 'create_room', geohash: null }));
    expect(await second).toMatchObject({ type: 'room_created' });
  });

  it('resends room_list to lobby clients with a nearby geohash when a room is created', async () => {
    server = await createLocalServer({ port: 0, host: '127.0.0.1' });
    const watcher = await connect(server.port);
    const first = nextMessage(watcher);
    watcher.send(JSON.stringify({ type: 'join', roomId: null, geohash: 'xn76ur', roomCode: null }));
    expect(await first).toMatchObject({ type: 'room_list', rooms: [] });

    const update = nextMessage(watcher);
    const creator = await connect(server.port);
    creator.send(JSON.stringify({ type: 'create_room', geohash: 'xn76ur' }));
    const list = await update;
    expect(list).toMatchObject({ type: 'room_list' });
    expect((list as { rooms: unknown[] }).rooms).toHaveLength(1);
  });

  it('binary frames return invalid_json', async () => {
    server = await createLocalServer({ port: 0, host: '127.0.0.1' });
    const socket = await connect(server.port);
    const reply = nextMessage(socket);
    socket.send(Buffer.from([1, 2, 3]));
    expect(await reply).toMatchObject({ type: 'error', code: 'invalid_json' });
  });

  it('messages over MAX_MESSAGE_BYTES return message_too_large and keep the connection', async () => {
    server = await createLocalServer({ port: 0, host: '127.0.0.1' });
    const socket = await connect(server.port);
    const reply = nextMessage(socket);
    socket.send('x'.repeat(MAX_MESSAGE_BYTES + 1));
    expect(await reply).toMatchObject({ type: 'error', code: 'message_too_large' });
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });

  it('a message of exactly MAX_MESSAGE_BYTES is not rejected as too large', async () => {
    server = await createLocalServer({ port: 0, host: '127.0.0.1' });
    const socket = await connect(server.port);
    const reply = nextMessage(socket);
    socket.send('x'.repeat(MAX_MESSAGE_BYTES));
    const message = await reply;
    expect(message).toMatchObject({ type: 'error', code: 'invalid_json' });
  });
});
