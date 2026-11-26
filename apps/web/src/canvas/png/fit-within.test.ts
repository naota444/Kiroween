import { describe, expect, it } from 'vitest';
import { fitWithin } from './fit-within.js';

describe('fitWithin', () => {
  it('scales 1000×500 down to 512×256', () => {
    expect(fitWithin(1000, 500)).toEqual({ width: 512, height: 256 });
  });

  it('leaves 300×200 unchanged (already within 512)', () => {
    expect(fitWithin(300, 200)).toEqual({ width: 300, height: 200 });
  });

  it('scales portrait 500×1000 down to 256×512', () => {
    expect(fitWithin(500, 1000)).toEqual({ width: 256, height: 512 });
  });

  it('scales exactly 512×512 to 512×512 (boundary — no change)', () => {
    expect(fitWithin(512, 512)).toEqual({ width: 512, height: 512 });
  });

  it('respects a custom max', () => {
    expect(fitWithin(400, 200, 200)).toEqual({ width: 200, height: 100 });
  });
});
