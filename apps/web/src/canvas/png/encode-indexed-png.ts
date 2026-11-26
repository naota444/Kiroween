// @vitest-environment node
import { zlibSync } from 'fflate';
import type { Rgb } from './types.js';

// ---------------------------------------------------------------------------
// CRC-32 (PNG spec, polynomial 0xEDB88320)
// ---------------------------------------------------------------------------

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Uint8Array, initial = 0xffffffff): number {
  let c = initial;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return c ^ 0xffffffff;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function u32be(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const payload = concat(typeBytes, data);
  const checksum = u32be(crc32(payload));
  return concat(u32be(data.length), payload, checksum);
}

// ---------------------------------------------------------------------------
// PNG signature
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

// ---------------------------------------------------------------------------
// encodeIndexedPng
// ---------------------------------------------------------------------------

/**
 * Encodes a 2-bit indexed-colour PNG.
 *
 * `indices` must have exactly `width * height` entries, each in [0, palette.length).
 * IDAT is compressed with fflate's zlibSync.
 */
export function encodeIndexedPng(
  indices: Uint8Array,
  width: number,
  height: number,
  palette: readonly Rgb[],
): Uint8Array {
  // ---- IHDR ----
  // Bit depth 2, colour type 3 (indexed)
  const ihdrData = concat(
    u32be(width),
    u32be(height),
    new Uint8Array([
      2, // bit depth
      3, // colour type: indexed
      0, // compression method
      0, // filter method
      0, // interlace method
    ]),
  );

  // ---- PLTE ----
  const plteData = new Uint8Array(palette.length * 3);
  for (let i = 0; i < palette.length; i++) {
    plteData[i * 3] = palette[i]![0];
    plteData[i * 3 + 1] = palette[i]![1];
    plteData[i * 3 + 2] = palette[i]![2];
  }

  // ---- Raw image data (filter byte 0x00 per row + packed 2-bit pixels) ----
  // Each row: 1 filter byte + ceil(width * 2 / 8) pixel bytes
  const bytesPerRow = Math.ceil((width * 2) / 8);
  const raw = new Uint8Array(height * (1 + bytesPerRow));

  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + bytesPerRow);
    raw[rowStart] = 0; // filter type None

    for (let x = 0; x < width; x++) {
      const idx = indices[y * width + x]! & 0x03; // 2-bit value
      const bitPos = x * 2; // bit offset within the row (MSB first)
      const bytePos = rowStart + 1 + Math.floor(bitPos / 8);
      const shift = 6 - (bitPos % 8); // MSB-first packing
      raw[bytePos]! |= idx << shift;
    }
  }

  // ---- IDAT ----
  const compressed = zlibSync(raw);

  // ---- Assemble ----
  return concat(
    PNG_SIGNATURE,
    chunk('IHDR', ihdrData),
    chunk('PLTE', plteData),
    chunk('IDAT', compressed),
    chunk('IEND', new Uint8Array(0)),
  );
}
