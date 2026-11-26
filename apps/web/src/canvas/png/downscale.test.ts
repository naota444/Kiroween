import { describe, expect, it } from 'vitest';
import { downscale } from './downscale.js';
import type { PixelBuffer } from './types.js';

function solidBuffer(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

describe('downscale', () => {
  it('returns original when target >= source size', () => {
    const src = solidBuffer(100, 100, 255, 0, 0);
    const result = downscale(src, { width: 200, height: 200 });
    expect(result).toBe(src);
  });

  it('produces the correct output dimensions', () => {
    const src = solidBuffer(1000, 500, 0, 0, 0);
    const result = downscale(src, { width: 512, height: 256 });
    expect(result.width).toBe(512);
    expect(result.height).toBe(256);
  });

  it('preserves a solid colour when downscaling', () => {
    const src = solidBuffer(100, 100, 128, 64, 32);
    const result = downscale(src, { width: 10, height: 10 });
    // All output pixels should be approximately the same solid colour
    expect(result.data[0]).toBeCloseTo(128, 0);
    expect(result.data[1]).toBeCloseTo(64, 0);
    expect(result.data[2]).toBeCloseTo(32, 0);
  });
});
