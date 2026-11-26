import { describe, expect, it } from 'vitest';
import { createSerialQueue } from './serial-queue.js';

describe('serial-queue', () => {
  it('積んだ順に、1つ終わってから次を実行する', async () => {
    const queue = createSerialQueue();
    const log: string[] = [];
    const slow = queue.push(async () => {
      log.push('a:start');
      await new Promise((r) => setTimeout(r, 20));
      log.push('a:end');
    });
    const fast = queue.push(() => {
      log.push('b');
    });
    await Promise.all([slow, fast]);
    expect(log).toEqual(['a:start', 'a:end', 'b']);
  });

  it('1つが例外を投げても次を続ける', async () => {
    const queue = createSerialQueue();
    const failed = queue.push(() => {
      throw new Error('boom');
    });
    const next = queue.push(() => 42);
    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe(42);
    await queue.idle();
  });
});
