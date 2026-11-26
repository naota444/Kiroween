import { encodeGeohash } from '@doodle-nearby/core';

const TIMEOUT_MS = 10_000;

export type GeohashResult = { ok: true; geohash: string } | { ok: false };

type GeolocationLike = Pick<Geolocation, 'getCurrentPosition'>;

/**
 * Requests the device location and immediately converts it to a 6-character
 * geohash. Latitude/longitude values are never stored, logged, or passed
 * outside this function.
 *
 * Returns `{ ok: false }` on any of:
 * - geolocation API unavailable (null/undefined passed)
 * - permission denied
 * - position unavailable
 * - 10-second self-managed timeout
 */
export function requestGeohash(
  geolocation: GeolocationLike | null | undefined,
): Promise<GeohashResult> {
  return new Promise((resolve) => {
    if (!geolocation) {
      resolve({ ok: false });
      return;
    }

    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ ok: false });
      }
    }, TIMEOUT_MS);

    geolocation.getCurrentPosition(
      (position) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          const geohash = encodeGeohash(position.coords.latitude, position.coords.longitude);
          resolve({ ok: true, geohash });
        } catch {
          resolve({ ok: false });
        }
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false });
      },
      { timeout: TIMEOUT_MS, maximumAge: 60_000 },
    );
  });
}
