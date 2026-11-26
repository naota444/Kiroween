// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../palette.js';
import { encodeIndexedPng } from './encode-indexed-png.js';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

describe('encodeIndexedPng', () => {
  it('starts with the PNG signature', () => {
    const indices = new Uint8Array(4); // 2×2 all-white
    const png = encodeIndexedPng(indices, 2, 2, PALETTE);
    expect(Array.from(png.slice(0, 8))).toEqual(PNG_SIGNATURE);
  });

  it('produces a non-empty Uint8Array for a 1×1 image', () => {
    const indices = new Uint8Array([1]); // 1 black pixel
    const png = encodeIndexedPng(indices, 1, 1, PALETTE);
    expect(png).toBeInstanceOf(Uint8Array);
    expect(png.length).toBeGreaterThan(0);
  });

  it('produces different output for different palette indices', () => {
    const white = encodeIndexedPng(new Uint8Array([0]), 1, 1, PALETTE);
    const black = encodeIndexedPng(new Uint8Array([1]), 1, 1, PALETTE);
    expect(white).not.toEqual(black);
  });
});
