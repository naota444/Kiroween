import { describe, expect, it } from 'vitest';
import { buildWsUrl } from './ws-url.js';

describe('buildWsUrl', () => {
  it('uses wss: for https:', () => {
    expect(buildWsUrl({ protocol: 'https:', host: '192.168.1.5:5173' })).toBe(
      'wss://192.168.1.5:5173/ws',
    );
  });

  it('uses ws: for http:', () => {
    expect(buildWsUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe(
      'ws://localhost:5173/ws',
    );
  });

  it('always appends /ws path', () => {
    const url = buildWsUrl({ protocol: 'https:', host: 'example.com' });
    expect(url.endsWith('/ws')).toBe(true);
  });

  it('contains only the given host — no extra hostnames', () => {
    const host = '10.0.0.1:5173';
    const url = buildWsUrl({ protocol: 'https:', host });
    // After stripping the scheme and host, only "/ws" should remain
    expect(url).toBe(`wss://${host}/ws`);
  });
});
