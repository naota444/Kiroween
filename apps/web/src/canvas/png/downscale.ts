import type { PixelBuffer } from './types.js';

/**
 * Downscales `src` to `target` dimensions using area-averaging.
 * Never upscales — if target is larger than src, returns src unchanged.
 */
export function downscale(
  src: PixelBuffer,
  target: { width: number; height: number },
): PixelBuffer {
  const tw = target.width;
  const th = target.height;

  // No-op when target is not smaller
  if (tw >= src.width && th >= src.height) {
    return src;
  }

  const scaleX = src.width / tw;
  const scaleY = src.height / th;
  const out = new Uint8ClampedArray(tw * th * 4);

  for (let ty = 0; ty < th; ty++) {
    // Source row range that maps to this target row
    const srcY0 = ty * scaleY;
    const srcY1 = srcY0 + scaleY;

    for (let tx = 0; tx < tw; tx++) {
      // Source column range that maps to this target column
      const srcX0 = tx * scaleX;
      const srcX1 = srcX0 + scaleX;

      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        weight = 0;

      // Iterate over all source pixels (and fractions) that contribute
      const iyStart = Math.floor(srcY0);
      const iyEnd = Math.ceil(srcY1);
      const ixStart = Math.floor(srcX0);
      const ixEnd = Math.ceil(srcX1);

      for (let iy = iyStart; iy < iyEnd; iy++) {
        const wy = Math.min(iy + 1, srcY1) - Math.max(iy, srcY0);
        for (let ix = ixStart; ix < ixEnd; ix++) {
          const wx = Math.min(ix + 1, srcX1) - Math.max(ix, srcX0);
          const w = wx * wy;
          const idx = (iy * src.width + ix) * 4;
          r += src.data[idx]! * w;
          g += src.data[idx + 1]! * w;
          b += src.data[idx + 2]! * w;
          a += src.data[idx + 3]! * w;
          weight += w;
        }
      }

      const oi = (ty * tw + tx) * 4;
      out[oi] = Math.round(r / weight);
      out[oi + 1] = Math.round(g / weight);
      out[oi + 2] = Math.round(b / weight);
      out[oi + 3] = Math.round(a / weight);
    }
  }

  return { data: out, width: tw, height: th };
}
