import type { Rect } from '../../shared/types';
import type { Bitmap } from './detect';

const DARK = 200;
const dark = (b: Bitmap, x: number, y: number) => {
  if (x < 0 || y < 0 || x >= b.width || y >= b.height) return false;
  const i = (y * b.width + x) * 4;
  return b.data[i + 3] > 0 && (b.data[i] + b.data[i + 1] + b.data[i + 2]) / 3 < DARK;
};

/** A boxed rehearsal number on the page (pixels), and the measure box it sits above. */
export type Boxed = { x: number; y: number; w: number; h: number; measure: number };

/**
 * Find the small rectangles printed above the systems that hold a rehearsal number (the "[24]" that is also the bar number).
 * A rectangle is two horizontal runs a digit-height apart joined by two upright sides. Reading the digits inside is left to OCR.
 * The rectangle must lie wholly above the staff, so beams and slurs of the staff itself are not mistaken for it.
 */
export function findBoxedNumbers(b: Bitmap, rects: Rect[]): Boxed[] {
  const out: Boxed[] = [];
  const seen = new Set<string>();
  rects.forEach((r, measure) => {
    const sp = (r.h * b.height) / 7;
    const rx0 = Math.round(r.x * b.width), rx1 = Math.round((r.x + r.w) * b.width);
    const staffTop = r.y * b.height + 1.5 * sp;
    const y0 = Math.max(0, Math.round(staffTop - 7 * sp)), y1 = Math.round(staffTop - 2.2 * sp); // the whole mark stays clear of the staff
    const minW = Math.round(sp * 2.5), maxW = Math.round(sp * 6.5);
    const hMin = Math.round(sp * 2.2), hMax = Math.round(sp * 4.4);
    for (let y = y0; y <= y1; y++) {
      for (let x = rx0; x < rx1; x++) {
        if (!dark(b, x, y) || dark(b, x - 1, y)) continue; // start of a horizontal run
        let z = x;
        while (dark(b, z + 1, y)) z++;
        const w = z - x + 1;
        if (w < minW || w > maxW) continue;
        for (let h = hMin; h <= hMax; h++) {
          const yb = y + h;
          let bottom = 0, left = 0, right = 0;
          for (let k = 0; k < w; k++) if (dark(b, x + k, yb) || dark(b, x + k, yb - 1) || dark(b, x + k, yb + 1)) bottom++;
          if (bottom < w * 0.85) continue;
          for (let k = 0; k <= h; k++) { if (dark(b, x, y + k) || dark(b, x + 1, y + k)) left++; if (dark(b, z, y + k) || dark(b, z - 1, y + k)) right++; }
          if (left < h * 0.85 || right < h * 0.85) continue;
          if (yb > staffTop - 0.1 * sp) continue;
          // a digit inside, and open paper just outside: a beam, slur or stem has ink running through its border
          let inside = 0, outside = 0, ring = 0;
          for (let yy = y + 3; yy < yb - 2; yy++) for (let xx = x + 3; xx < z - 2; xx++) if (dark(b, xx, yy)) inside++;
          for (let k = -1; k <= w + 1; k++) { ring += 2; if (dark(b, x + k, y - 2)) outside++; if (dark(b, x + k, yb + 3)) outside++; }
          const area = Math.max(1, (h - 5) * (w - 5));
          if (inside / area < 0.08 || inside / area > 0.7 || outside / ring > 0.25) continue;
          const key = `${Math.round(x / 4)}:${Math.round(y / 4)}`;
          if (!seen.has(key)) { seen.add(key); out.push({ x, y, w, h, measure }); }
          break;
        }
      }
    }
  });
  return out;
}
