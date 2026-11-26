/** RGB triple (each 0–255) */
export type Rgb = readonly [number, number, number];

/** RGBA pixel buffer as returned by canvas.getImageData() */
export type PixelBuffer = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};
