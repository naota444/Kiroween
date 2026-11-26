import { describe, expect, it } from 'vitest';
import type { Rgb } from './types.js';
import { quantizeToPalette } from './quantize.js';

const PALETTE: readonly Rgb[] = [
  [255, 255, 255], // 0: white
  [0, 0, 0], // 1: black
  [255, 0, 0], // 2: red
];

function onePixelBuffer(r: number, g: number, b: number) {
  return {
    data: new Uint8ClampedArray([r, g, b, 255]),
    width: 1,
    height: 1,
  };
}

describe('quantizeToPalette', () => {
  it('maps a white pixel to index 0', () => {
    const result = quantizeToPalette(onePixelBuffer(255, 255, 255), PALETTE);
    expect(result[0]).toBe(0);
  });

  it('maps a black pixel to index 1', () => {
    const result = quantizeToPalette(onePixelBuffer(0, 0, 0), PALETTE);
    expect(result[0]).toBe(1);
  });

  it('maps a red pixel to index 2', () => {
    const result = quantizeToPalette(onePixelBuffer(255, 0, 0), PALETTE);
    expect(result[0]).toBe(2);
  });

  it('maps a near-red pixel to index 2 (nearest neighbour)', () => {
    const result = quantizeToPalette(onePixelBuffer(240, 20, 20), PALETTE);
    expect(result[0]).toBe(2);
  });

  it('returns an array with one entry per pixel', () => {
    const buf = {
      data: new Uint8ClampedArray(4 * 4), // 2×2 pixels
      width: 2,
      height: 2,
    };
    expect(quantizeToPalette(buf, PALETTE)).toHaveLength(4);
  });
});
