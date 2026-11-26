import type { WebSocket } from 'ws';
import { describe, expect, it } from 'vitest';
import { ConnectionRegistry } from './connection-registry.js';

type State = { connectionId: string; geohash: string | null; roomId: string | null };

describe('connection-registry', () => {
  const socket = {} as WebSocket;

  it('追加・取得・状態更新・削除ができる', () => {
    const registry = new ConnectionRegistry<State>();
    registry.add({ connectionId: 'c1', geohash: null, roomId: null }, socket);
    expect(registry.size).toBe(1);
    expect(registry.get('c1')?.socket).toBe(socket);

    registry.updateState('c1', { connectionId: 'c1', geohash: null, roomId: 'r1' });
    expect(registry.get('c1')?.state.roomId).toBe('r1');
    expect(registry.all()).toHaveLength(1);

    expect(registry.remove('c1')).toBe(true);
    expect(registry.remove('c1')).toBe(false);
    expect(registry.get('c1')).toBeUndefined();
  });

  it('未登録の接続の更新は無視する', () => {
    const registry = new ConnectionRegistry<State>();
    registry.updateState('x', { connectionId: 'x', geohash: null, roomId: null });
    expect(registry.size).toBe(0);
  });
});
