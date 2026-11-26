export interface Clock {
  now(): number; // epoch ミリ秒
}

export const systemClock: Clock = { now: () => Date.now() };

/** テスト用の手動時計 */
export function createManualClock(start: number): Clock & {
  set(t: number): void;
  advance(ms: number): void;
} {
  let current = start;
  return {
    now: () => current,
    set(t: number) {
      current = t;
    },
    advance(ms: number) {
      current += ms;
    },
  };
}
