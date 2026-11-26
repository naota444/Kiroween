import { PARTICIPANT_COLORS, PARTICIPANT_ICONS, type ParticipantIdentity } from './messages.js';

/**
 * 色 × アイコン(96 通り)から、taken にないものを random で 1 つ選ぶ。
 * 空きがなければ null。random は 0 以上 1 未満。
 */
export function pickIdentity(
  taken: readonly ParticipantIdentity[],
  random: () => number,
): ParticipantIdentity | null {
  const free: ParticipantIdentity[] = [];
  for (const color of PARTICIPANT_COLORS) {
    for (const icon of PARTICIPANT_ICONS) {
      if (!taken.some((t) => t.color === color && t.icon === icon)) {
        free.push({ color, icon });
      }
    }
  }
  if (free.length === 0) return null;
  const index = Math.min(free.length - 1, Math.max(0, Math.floor(random() * free.length)));
  return free[index] ?? null;
}
