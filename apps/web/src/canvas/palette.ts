import type { Rgb } from './png/types.js';

/** Pen stroke colours (3 colours, excluding white) */
export const PEN_COLORS = ['black', 'red', 'blue'] as const;
export type PenColor = (typeof PEN_COLORS)[number];

/** Stroke widths in pixels: [thin, thick] */
export const WIDTHS = [4, 10] as const;
export type PenWidth = (typeof WIDTHS)[number];

/** White background colour */
export const WHITE: Rgb = [255, 255, 255];

/** CSS colour values for each pen colour */
export const PEN_COLOR_CSS: Record<PenColor, string> = {
  black: '#000000',
  red: '#ef4444',
  blue: '#3b82f6',
};

/**
 * 4-colour palette used for PNG encoding.
 * Index 0 = white (background / eraser), 1-3 = pen colours.
 */
export const PALETTE: readonly Rgb[] = [
  WHITE,
  [0, 0, 0], // black
  [239, 68, 68], // red  (#ef4444)
  [59, 130, 246], // blue (#3b82f6)
];
