import ngeohash from 'ngeohash';
import { GEOHASH_LENGTH } from './messages.js';
import { isGeohash } from './parser.js';

export class InvalidCoordinateError extends Error {}
export class InvalidGeohashError extends Error {}

/** 緯度 -90〜90、経度 -180〜180(含む)の有限数から 6 文字の geohash を返す。範囲外・非有限は InvalidCoordinateError */
export function encodeGeohash(latitude: number, longitude: number): string {
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new InvalidCoordinateError('latitude/longitude out of range or not finite');
  }
  return ngeohash.encode(latitude, longitude, GEOHASH_LENGTH);
}

/** 自分と周囲 8 マス。自分が先頭。重複なし。6 文字でなければ InvalidGeohashError */
export function neighborCells(geohash: string): string[] {
  if (!isGeohash(geohash)) {
    throw new InvalidGeohashError(`geohash must be ${GEOHASH_LENGTH} geohash characters`);
  }
  return [...new Set([geohash, ...ngeohash.neighbors(geohash)])];
}
