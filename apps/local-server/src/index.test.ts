import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT, startupMessage } from './index.js';

describe('local-server', () => {
  it('起動メッセージにポートが入る', () => {
    expect(startupMessage()).toContain(String(DEFAULT_PORT));
  });
});
