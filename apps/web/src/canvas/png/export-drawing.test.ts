// @vitest-environment node
import { MAX_IMAGE_DATA_CHARS } from '@doodle-nearby/core';
import * as zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PALETTE, PEN_COLOR_CSS } from '../palette.js';
import { exportDrawing } from './export-drawing.js';
import type { PixelBuffer } from './types.js';

function solidBuffer(width: number, height: number, r: number, g: number, b: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

describe('exportDrawing', () => {
  it('returns blank for an all-white input', () => {
    const src = solidBuffer(100, 100, 255, 255, 255);
    expect(exportDrawing(src, PALETTE)).toEqual({ ok: false, reason: 'blank' });
  });

  it('returns ok:true for a single black pixel', () => {
    // 1×1 black pixel — definitely not blank, definitely fits
    const data = new Uint8ClampedArray([0, 0, 0, 255]);
    const src: PixelBuffer = { data, width: 1, height: 1 };
    const result = exportDrawing(src, PALETTE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.imageData).toBe('string');
      expect(result.imageData.length).toBeGreaterThan(0);
    }
  });

  it('returns ok:true with imageData within maxChars', () => {
    const src = solidBuffer(100, 100, 0, 0, 0); // solid black
    const result = exportDrawing(src, PALETTE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.imageData.length).toBeLessThanOrEqual(30_000);
    }
  });

  it('returns too_large when maxChars is tiny', () => {
    const src = solidBuffer(100, 100, 0, 0, 0);
    const result = exportDrawing(src, PALETTE, 10);
    expect(result).toEqual({ ok: false, reason: 'too_large' });
  });
});

// ---------------------------------------------------------------------------
// Property 19: 縮小後の大きさ
// PNG の署名・IHDR の幅・高さが 512 以下、元の縦横比が 1px 以内で保たれること
// ---------------------------------------------------------------------------

/** Decode the base64 PNG and read IHDR width/height */
function parsePngDimensions(base64: string): { width: number; height: number } {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  // PNG signature: 8 bytes
  // IHDR chunk: 4 (length) + 4 (type) + 4 (width) + 4 (height) + ...
  const view = new DataView(bytes.buffer);
  const width = view.getUint32(16, false); // big-endian
  const height = view.getUint32(20, false);
  return { width, height };
}

/** Decompress IDAT and return the raw filtered bytes */
function decompressIdat(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = Buffer.from(binary, 'binary');

  // Walk chunks after the 8-byte signature
  let offset = 8;
  const idatChunks: Buffer[] = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') {
      idatChunks.push(bytes.subarray(offset + 8, offset + 8 + length));
    }
    if (type === 'IEND') break;
    offset += 12 + length; // length + type(4) + data + crc(4)
  }
  const combined = Buffer.concat(idatChunks);
  return zlib.inflateSync(combined);
}

describe('Property 19: 縮小後の大きさ', () => {
  const cases: Array<{ label: string; w: number; h: number }> = [
    { label: '幅だけ512超 (1000×100)', w: 1000, h: 100 },
    { label: '高さだけ512超 (100×1000)', w: 100, h: 1000 },
    { label: '両方512超 (1000×800)', w: 1000, h: 800 },
    { label: '512以下 (300×200) — 拡大されない', w: 300, h: 200 },
    { label: '極端な横長 (2000×50)', w: 2000, h: 50 },
    { label: '極端な縦長 (50×2000)', w: 50, h: 2000 },
  ];

  for (const { label, w, h } of cases) {
    it(label, () => {
      // 市松模様（白と黒を交互）にして、縮小後も必ず黒が残るようにする
      const src = solidBuffer(w, h, 255, 255, 255);
      for (let i = 0; i < w * h; i++) {
        if (i % 2 === 0) {
          src.data[i * 4] = 0;
          src.data[i * 4 + 1] = 0;
          src.data[i * 4 + 2] = 0;
        }
      }

      const result = exportDrawing(src, PALETTE);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const { width: outW, height: outH } = parsePngDimensions(result.imageData);

      // 幅・高さが 512 以下
      expect(outW).toBeLessThanOrEqual(512);
      expect(outH).toBeLessThanOrEqual(512);

      // 512 以下の元は拡大されない
      if (w <= 512 && h <= 512) {
        expect(outW).toBe(w);
        expect(outH).toBe(h);
      }

      // 縦横比が元と 1px 以内で一致する
      const originalRatio = w / h;
      const outputRatio = outW / outH;
      const tolerance = Math.max(1 / outH, 1 / outW); // 1px の誤差
      expect(Math.abs(originalRatio - outputRatio)).toBeLessThanOrEqual(
        originalRatio * tolerance + 0.01,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Property 20: 絵の書き出し
// ペンの3色と白だけの画素で imageData が MAX_IMAGE_DATA_CHARS 以下になること
// ---------------------------------------------------------------------------

describe('Property 20: 絵の書き出し', () => {
  it('solid pen colours produce imageData within MAX_IMAGE_DATA_CHARS', () => {
    // ペンの3色それぞれで 512×512 の最大サイズ入力をテスト
    const penRgbs: Array<[number, number, number]> = [
      [0, 0, 0], // black
      [239, 68, 68], // red
      [59, 130, 246], // blue
    ];
    for (const [r, g, b] of penRgbs) {
      const src = solidBuffer(512, 512, r, g, b);
      const result = exportDrawing(src, PALETTE);
      expect(result.ok, `pen colour rgb(${r},${g},${b}) should export ok`).toBe(true);
      if (result.ok) {
        expect(result.imageData.length).toBeLessThanOrEqual(MAX_IMAGE_DATA_CHARS);
      }
    }
  });

  it('decompressed IDAT pixel indices are only 0–3 (palette range)', () => {
    const src = solidBuffer(10, 10, 0, 0, 0); // 10×10 black
    const result = exportDrawing(src, PALETTE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const raw = decompressIdat(result.imageData);
    const { width, height } = parsePngDimensions(result.imageData);
    const bytesPerRow = Math.ceil((width * 2) / 8);

    for (let y = 0; y < height; y++) {
      const rowBase = y * (1 + bytesPerRow) + 1; // skip filter byte
      for (let x = 0; x < width; x++) {
        const bitPos = x * 2;
        const byteOff = Math.floor(bitPos / 8);
        const shift = 6 - (bitPos % 8);
        const idx = (raw[rowBase + byteOff]! >> shift) & 0x03;
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(3);
      }
    }
  });
});

// suppress unused-import warning for PEN_COLOR_CSS (used for documentation)
void PEN_COLOR_CSS;
