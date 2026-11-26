import { GEOHASH_ALPHABET } from '@doodle-nearby/core';
import { describe, expect, it } from 'vitest';
import { requestGeohash } from './request-geohash.js';

/** Build a fake Geolocation that immediately calls onSuccess */
function fakeGeoSuccess(lat: number, lon: number): Pick<Geolocation, 'getCurrentPosition'> {
  return {
    getCurrentPosition(onSuccess) {
      onSuccess({
        coords: {
          latitude: lat,
          longitude: lon,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition);
    },
  };
}

/** Build a fake Geolocation that immediately calls onError */
function fakeGeoError(): Pick<Geolocation, 'getCurrentPosition'> {
  return {
    getCurrentPosition(_onSuccess, onError) {
      onError?.({
        code: 1,
        message: 'PERMISSION_DENIED',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
    },
  };
}

describe('requestGeohash', () => {
  it('resolves with a 6-character geohash on success', async () => {
    // Tokyo approx coordinates
    const result = await requestGeohash(fakeGeoSuccess(35.6895, 139.6917));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.geohash).toHaveLength(6);
    for (const ch of result.geohash) {
      expect(GEOHASH_ALPHABET).toContain(ch);
    }
  });

  it('resolves with ok:false when permission is denied', async () => {
    const result = await requestGeohash(fakeGeoError());
    expect(result).toEqual({ ok: false });
  });

  it('resolves with ok:false when geolocation is null', async () => {
    const result = await requestGeohash(null);
    expect(result).toEqual({ ok: false });
  });

  it('resolves with ok:false when geolocation is undefined', async () => {
    const result = await requestGeohash(undefined);
    expect(result).toEqual({ ok: false });
  });
});
