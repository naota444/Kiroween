/**
 * Returns dimensions that fit within `max` on the longest side,
 * preserving the aspect ratio. Never upscales (returns original size
 * when both dimensions are already within `max`).
 * Both returned values are integers >= 1.
 */
export function fitWithin(
  width: number,
  height: number,
  max = 512,
): { width: number; height: number } {
  if (width <= max && height <= max) {
    return { width, height };
  }

  const scale = max / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
