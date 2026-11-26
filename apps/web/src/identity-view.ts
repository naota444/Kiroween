import type { ParticipantColor, ParticipantIcon } from '@doodle-nearby/core';

/** Maps each ParticipantColor to a CSS colour value */
export const COLOR_CSS: Record<ParticipantColor, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  teal: '#14b8a6',
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899',
};

/** Maps each ParticipantIcon to an emoji (Unicode 9 or earlier animals) */
export const ICON_EMOJI: Record<ParticipantIcon, string> = {
  cat: '\uD83D\uDC31', // 🐱
  dog: '\uD83D\uDC36', // 🐶
  rabbit: '\uD83D\uDC30', // 🐰
  bear: '\uD83D\uDC3B', // 🐻
  fox: '\uD83E\uDD8A', // 🦊
  panda: '\uD83D\uDC3C', // 🐼
  frog: '\uD83D\uDC38', // 🐸
  penguin: '\uD83D\uDC27', // 🐧
  owl: '\uD83E\uDD89', // 🦉
  koala: '\uD83D\uDC28', // 🐨
  tiger: '\uD83D\uDC2F', // 🐯
  whale: '\uD83D\uDC33', // 🐳
};
