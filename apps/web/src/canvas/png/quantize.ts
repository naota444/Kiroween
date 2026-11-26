import type { PixelBuffer, Rgb } from './types.js';

/** Squared Euclidean distance between two RGB colours */
function distSq(a: Rgb, b: Rgb): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/**
 * Maps every pixel in `src` to the index of the nearest colour in `palette`.
 * Returns a Uint8Array of length `width * height`.
 */
export function quantizeToPalette(src: PixelBuffer, palette: readonly Rgb[]): Uint8Array {
  const n = src.width * src.height;
  const indices = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    const offset = i * 4;
    const pixel: Rgb = [src.data[offset]!, src.data[offset + 1]!, src.data[offset + 2]!];

    let best = 0;
    let bestDist = Infinity;
    for (let p = 0; p < palette.length; p++) {
      const d = distSq(pixel, palette[p]!);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    indices[i] = best;
  }

  return indices;
}
