import type { Rect } from '../../shared/types';
import type { Bitmap } from './detect';

const DARK = 200;
const dark = (b: Bitmap, x: number, y: number) => {
  const i = (y * b.width + x) * 4;
  return b.data[i + 3] > 0 && (b.data[i] + b.data[i + 1] + b.data[i + 2]) / 3 < DARK;
};

/**
 * Does this box hold a multi-measure rest: a thick horizontal bar across the staff's middle line, a cap at each end, and next to
 * nothing else? A whole or half rest is far shorter, a beam has stems and noteheads, a staff line is thin. Works on one staff:
 * a box is the staff plus 1.5 staff spaces above and below.
 */
export function restBar(b: Bitmap, rect: Rect): { x0: number; x1: number; staffTop: number; sp: number } | null {
  const x0 = Math.round(rect.x * b.width), x1 = Math.round((rect.x + rect.w) * b.width) - 1;
  const y0 = Math.round(rect.y * b.height), y1 = Math.round((rect.y + rect.h) * b.height) - 1;
  const sp = (y1 - y0 + 1) / 7;
  const top = Math.round(y0 + 1.5 * sp), bottom = Math.round(y1 - 1.5 * sp);
  const width = x1 - x0 + 1;
  if (width < sp * 6 || bottom - top < sp * 3) return null;

  // how thick the dark is through the middle of the staff, column by column: a staff line is 2-3 px, the rest bar much more
  const yMid = Math.round((top + bottom) / 2);
  const thickness = (x: number) => {
    let best = 0;
    const reach = Math.round(sp * 0.9); // the bar hangs on the middle line, but a scan can tilt it by most of a space
    for (let y = yMid - reach; y <= yMid + reach; y++) {
      if (!dark(b, x, y)) continue;
      let a = y, z = y;
      while (a > top && dark(b, x, a - 1)) a--;
      while (z < bottom && dark(b, x, z + 1)) z++;
      best = Math.max(best, z - a + 1);
    }
    return best;
  };
  // what counts as thick depends on the scan: the staff line itself (the thinnest column) may be 2 px or 3
  const thick: number[] = [];
  for (let x = x0; x <= x1; x++) thick.push(thickness(x));
  const line = [...thick].sort((p, q) => p - q)[Math.floor(thick.length * 0.25)];
  const need = Math.max(3, line + 1.5);
  let bx0 = x0, bx1 = x0, best = 0, start = -1;
  for (let x = x0; x <= x1 + 1; x++) {
    const on = x <= x1 && thick[x - x0] >= need;
    if (on && start < 0) start = x;
    if (!on && start >= 0) { if (x - start > best) { best = x - start; bx0 = start; bx1 = x - 1; } start = -1; }
  }
  if (best < Math.max(sp * 4, width * 0.3)) return null; // a whole rest is about one space wide: far shorter
  if (bx0 < x0 + sp * 0.8 || bx1 > x1 - sp * 0.8) return null; // a bar that runs into the box edges is a staff line, not a rest

  // a cap at each end, taller than the bar (a beam or a tie has none)
  const cap = (x: number) => { let n = 0; for (let y = top; y <= bottom; y++) if (dark(b, x, y)) n++; return n; };
  const around = (x: number) => Math.max(cap(x - 1), cap(x), cap(x + 1));
  if (around(bx0 + 1) < sp * 2.2 && around(bx0) < sp * 2.2) return null;
  if (around(bx1 - 1) < sp * 2.2 && around(bx1) < sp * 2.2) return null;

  // between the caps, off the bar and off the staff lines (and the soft edges a scan gives them), there is nothing: no notes, no stems
  const colLine = (y: number) => { let n = 0; for (let x = x0; x <= x1; x++) if (dark(b, x, y)) n++; return n / width > 0.3; };
  const skip = new Set<number>();
  for (let y = top; y <= bottom; y++) if (colLine(y)) for (let d = -2; d <= 2; d++) skip.add(y + d);
  for (let y = yMid - Math.ceil(need); y <= yMid + Math.ceil(need); y++) skip.add(y);
  const ix0 = bx0 + Math.round(sp), ix1 = bx1 - Math.round(sp);
  if (ix1 <= ix0) return null;
  let other = 0, cells = 0;
  for (let y = top; y <= bottom; y++) {
    if (skip.has(y)) continue;
    for (let x = ix0; x <= ix1; x++) { cells++; if (dark(b, x, y)) other++; }
  }
  return cells > 0 && other / cells < 0.04 ? { x0: bx0, x1: bx1, staffTop: top, sp } : null;
}

export const hasRestBar = (b: Bitmap, rect: Rect) => restBar(b, rect) !== null;

/**
 * Is this box all but empty (a whole-bar rest, or nothing at all)? Such a box is narrow for a good reason, so a narrow one
 * that is quiet is not a false split. Staff lines and their soft edges do not count as ink.
 */
export function isQuiet(b: Bitmap, rect: Rect): boolean {
  const x0 = Math.round(rect.x * b.width), x1 = Math.round((rect.x + rect.w) * b.width) - 1;
  const y0 = Math.round(rect.y * b.height), y1 = Math.round((rect.y + rect.h) * b.height) - 1;
  const sp = (y1 - y0 + 1) / 7;
  const top = Math.round(y0 + 1.5 * sp), bottom = Math.round(y1 - 1.5 * sp);
  const width = x1 - x0 + 1;
  if (width < 4 || bottom - top < sp * 3) return false;
  const lineRow = new Set<number>();
  for (let y = top; y <= bottom; y++) {
    let n = 0;
    for (let x = x0; x <= x1; x++) if (dark(b, x, y)) n++;
    if (n / width > 0.3) for (let d = -2; d <= 2; d++) lineRow.add(y + d);
  }
  let ink = 0, cells = 0;
  for (let y = top; y <= bottom; y++) {
    if (lineRow.has(y)) continue;
    for (let x = x0 + 2; x <= x1 - 2; x++) { cells++; if (dark(b, x, y)) ink++; }
  }
  return cells > 0 && ink / cells < 0.06;
}
