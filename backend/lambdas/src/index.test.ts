import { describe, expect, it } from 'vitest';

describe('lambdas', () => {
  it('入口モジュールが core を解決して読み込める', async () => {
    await expect(import('./index.js')).resolves.toBeDefined();
  });
});
