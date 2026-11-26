import { describe, expect, it } from 'vitest';
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
