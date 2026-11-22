import { describe, expect, it } from 'vitest';
import * as core from './index.js';

describe('core', () => {
  it('モジュールを読み込める', () => {
    expect(core).toBeDefined();
  });
});
