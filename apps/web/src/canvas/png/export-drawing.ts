// @vitest-environment node
import { MAX_IMAGE_DATA_CHARS } from '@doodle-nearby/core';
import { downscale } from './downscale.js';
import { encodeIndexedPng } from './encode-indexed-png.js';
import { fitWithin } from './fit-within.js';
import { quantizeToPalette } from './quantize.js';
import type { PixelBuffer, Rgb } from './types.js';

export type ExportResult =
  | { ok: true; imageData: string; width: number; height: number }
  | { ok: false; reason: 'blank' | 'too_large' };

/** Downscale steps to try in order (longest side, pixels) */
const STEPS = [512, 384, 256] as const;

/**
 * Exports a drawing as a base64-encoded indexed-colour PNG.
 *
 * Tries [512, 384, 256] px steps in order, returning the first that fits
 * within `maxChars`. Returns `blank` when every pixel maps to palette index 0
 * (white), and `too_large` when even 256 px exceeds the limit.
 */
export function exportDrawing(
  src: PixelBuffer,
  palette: readonly Rgb[],
  maxChars = MAX_IMAGE_DATA_CHARS,
): ExportResult {
  for (const step of STEPS) {
    const target = fitWithin(src.width, src.height, step);
    const scaled = downscale(src, target);
    const indices = quantizeToPalette(scaled, palette);

    // Check for blank (all pixels map to index 0 = white)
    const isBlank = indices.every((v) => v === 0);
    if (isBlank) {
      return { ok: false, reason: 'blank' };
    }

    const pngBytes = encodeIndexedPng(indices, scaled.width, scaled.height, palette);

    // btoa works in both browser and Node ≥ 16
    const base64 = btoa(String.fromCharCode(...pngBytes));

    if (base64.length <= maxChars) {
      return { ok: true, imageData: base64, width: scaled.width, height: scaled.height };
    }
  }

  return { ok: false, reason: 'too_large' };
}
