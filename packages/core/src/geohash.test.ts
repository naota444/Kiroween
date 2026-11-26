import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GEOHASH_ALPHABET } from './messages.js';
import { InvalidCoordinateError, encodeGeohash, neighborCells } from './geohash.js';

describe('geohash (smoke)', () => {
  it('東京付近を 6 文字の geohash にする', () => {
    expect(encodeGeohash(35.681, 139.767)).toHaveLength(6);
  });

  it('NaN と緯度 91 は InvalidCoordinateError', () => {
    expect(() => encodeGeohash(Number.NaN, 139)).toThrow(InvalidCoordinateError);
    expect(() => encodeGeohash(91, 139)).toThrow(InvalidCoordinateError);
  });

  it('内部のマスの neighborCells は 9 件で自分が先頭', () => {
    const cells = neighborCells('xn76ur');
    expect(cells).toHaveLength(9);
    expect(cells[0]).toBe('xn76ur');
  });
});

// Feature: local-prototype, Property 6: 近傍のマス
// Validates: Requirements 8.7, 13.4
describe('Property 6: 近傍のマス', () => {
  const geohash6 = fc
    .array(fc.constantFrom(...GEOHASH_ALPHABET.split('')), { minLength: 6, maxLength: 6 })
    .map((cs) => cs.join(''));

  it('自分が先頭・重複なし・9 件または 6 件', () => {
    fc.assert(
      fc.property(geohash6, (a) => {
        const cells = neighborCells(a);
        expect(cells[0]).toBe(a);
        expect(new Set(cells).size).toBe(cells.length);
        expect([9, 6]).toContain(cells.length);
      }),
      { numRuns: 200 },
    );
  });

  it('B が neighborCells(A) に含まれるなら A も neighborCells(B) に含まれる', () => {
    fc.assert(
      fc.property(geohash6, (a) => {
        for (const b of neighborCells(a)) {
          expect(neighborCells(b)).toContain(a);
        }
      }),
      { numRuns: 200 },
    );
  });
});
