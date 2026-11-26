import type { ServerMessage } from '@doodle-nearby/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openConnection } from './connection.js';

// Minimal fake WebSocket — the constructor stores the last created instance
// so tests can trigger events on it.
let lastFakeWs: FakeWebSocket;

class FakeWebSocket {
  public readyState = 1; // OPEN
  private listeners = new Map<string, Array<(event: unknown) => void>>();

  constructor(public url: string) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    lastFakeWs = this;
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(listener);
  }

  send(data: string): void {
    void data;
  }

  close(): void {
    this.readyState = 3; // CLOSED
  }

  // Test helper: trigger a listener
  trigger(type: string, event: unknown): void {
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }
}

describe('openConnection', () => {
  beforeEach(() => {
    globalThis.WebSocket = FakeWebSocket as never;
  });

  it('calls onMessage with a successfully parsed message', () => {
    const onMessage = vi.fn();
    const onClose = vi.fn();
    openConnection('ws://test', { onMessage, onClose });

    const msg: ServerMessage = {
      type: 'room_list',
      rooms: [{ roomId: 'r1', roomCode: '1234', geohash: 'xn76ur', participantCount: 2, sameHash: true }],
    };
    lastFakeWs.trigger('message', { data: JSON.stringify(msg) });

    expect(onMessage).toHaveBeenCalledOnce();
    const received = onMessage.mock.calls[0]![0] as ServerMessage;
    expect(received.type).toBe('room_list');
  });

  it('ignores messages that fail to parse', () => {
    const onMessage = vi.fn();
    const onClose = vi.fn();
    openConnection('ws://test', { onMessage, onClose });

    lastFakeWs.trigger('message', { data: 'not valid json' });
    lastFakeWs.trigger('message', { data: JSON.stringify({ type: 'unknown_type' }) });

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('calls onClose once on close event', () => {
    const onMessage = vi.fn();
    const onClose = vi.fn();
    openConnection('ws://test', { onMessage, onClose });

    lastFakeWs.trigger('close', {});
    lastFakeWs.trigger('close', {});

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose once on error event', () => {
    const onMessage = vi.fn();
    const onClose = vi.fn();
    openConnection('ws://test', { onMessage, onClose });

    lastFakeWs.trigger('error', {});

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose only once even when both error and close fire', () => {
    const onMessage = vi.fn();
    const onClose = vi.fn();
    openConnection('ws://test', { onMessage, onClose });

    lastFakeWs.trigger('error', {});
    lastFakeWs.trigger('close', {});

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
