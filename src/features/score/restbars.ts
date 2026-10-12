import type { Rect } from '../../shared/types';
import type { Bitmap } from './detect';

const DARK = 200;
const dark = (b: Bitmap, x: number, y: number) => {
  const i = (y * b.width + x) * 4;
  return b.data[i + 3] > 0 && (b.data[i] + b.data[i + 1] + b.data[i + 2]) / 3 < DARK;
};

/**
 * Which boxes hold a multi-measure rest: a thick horizontal bar across the staff and next to nothing else. A whole or half rest is far
 * shorter, a beam has stems and noteheads hanging off it, and a staff line is thin. Works on a box of one staff (a box is
 * the staff plus 1.5 staff spaces above and below, so its staff is the middle of it).
 */
export function hasRestBar(b: Bitmap, rect: Rect): boolean {
  const x0 = Math.round(rect.x * b.width), x1 = Math.round((rect.x + rect.w) * b.width) - 1;
  const y0 = Math.round(rect.y * b.height), y1 = Math.round((rect.y + rect.h) * b.height) - 1;
  const sp = (y1 - y0 + 1) / 7;
  const top = Math.round(y0 + 1.5 * sp), bottom = Math.round(y1 - 1.5 * sp);
  if (x1 - x0 < sp * 4 || bottom - top < sp * 3) return false;

  // staff-line rows: dark across most of the width
  const width = x1 - x0 + 1;
  const rows: { y: number; run: number; frac: number }[] = [];
  for (let y = top; y <= bottom; y++) {
    let n = 0, run = 0, longest = 0;
    for (let x = x0; x <= x1; x++) {
      if (dark(b, x, y)) { n++; run++; if (run > longest) longest = run; } else run = 0;
    }
    rows.push({ y, run: longest, frac: n / width });
  }
  const isLine = (r: { frac: number; run: number }) => r.frac > 0.8 && r.run > width * 0.8;
  const minRun = Math.max(sp * 3, width * 0.3);
  // rows that belong to a thick bar: a long dark run that is not a full-width staff line
  const bar = rows.filter((r) => r.run >= minRun && !isLine(r));
  if (bar.length < Math.max(3, Math.round(sp * 0.3))) return false;
  const barRows = new Set(bar.map((r) => r.y));

  // where the bar is, from its middle row
  const mid = bar[Math.floor(bar.length / 2)].y;
  let bx0 = x0, bx1 = x0, best = 0, runStart = -1;
  for (let x = x0; x <= x1 + 1; x++) {
    const on = x <= x1 && dark(b, x, mid);
    if (on && runStart < 0) runStart = x;
    if (!on && runStart >= 0) { if (x - runStart > best) { best = x - runStart; bx0 = runStart; bx1 = x - 1; } runStart = -1; }
  }
  if (best < sp * 3) return false;

  // inside the bar (clear of its end caps) there must be nothing but the bar and the staff lines
  const ix0 = bx0 + Math.round(sp), ix1 = bx1 - Math.round(sp);
  if (ix1 <= ix0) return false;
  const lineRows = new Set(rows.filter(isLine).flatMap((r) => [r.y - 1, r.y, r.y + 1]));
  let other = 0, cells = 0;
  for (let y = top; y <= bottom; y++) {
    if (barRows.has(y) || lineRows.has(y)) continue;
    for (let x = ix0; x <= ix1; x++) { cells++; if (dark(b, x, y)) other++; }
  }
  return cells > 0 && other / cells < 0.04;
}
