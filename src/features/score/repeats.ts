import type { Measure } from '../../shared/types';
import type { Bitmap } from './detect';
import type { Suggestion } from './readmarks';

const DARK = 200;
const dark = (b: Bitmap, x: number, y: number) => {
  if (x < 0 || y < 0 || x >= b.width || y >= b.height) return false;
  const i = (y * b.width + x) * 4;
  return b.data[i + 3] > 0 && (b.data[i] + b.data[i + 1] + b.data[i + 2]) / 3 < DARK;
};

/** The first (top) staff inside a box: where its five lines are, and the space between them. Null when there is no staff to read. */
function staffIn(b: Bitmap, x0: number, x1: number, y0: number, y1: number): { top: number; bottom: number; sp: number } | null {
  const rows: number[] = [];
  for (let y = y0; y <= y1; y++) {
    let n = 0;
    for (let x = x0; x <= x1; x++) if (dark(b, x, y)) n++;
    rows.push(n / (x1 - x0 + 1));
  }
  const lines: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] < 0.6) continue;
    let j = i;
    while (j + 1 < rows.length && rows[j + 1] >= 0.6) j++;
    lines.push(y0 + (i + j) / 2);
    i = j;
  }
  if (lines.length < 5) return null;
  const gaps = lines.slice(1).map((v, i) => v - lines[i]).sort((p, q) => p - q);
  const sp = gaps[Math.floor(gaps.length / 4)];
  if (!(sp >= 4)) return null;
  for (let i = 0; i + 4 < lines.length; i++) {
    if ([1, 2, 3, 4].every((k) => Math.abs(lines[i + k] - lines[i + k - 1] - sp) <= sp * 0.3)) return { top: lines[i], bottom: lines[i + 4], sp };
  }
  return null;
}

type Side = 'start' | 'end';

/**
 * Repeat signs at the left and right ends of a box: a thick and a thin barline with two dots in the middle spaces of the staff.
 * Dots to the left of the lines close a repeat (":|"), dots to the right open one ("|:"). Best effort on a rendered page:
 * a hand-written or heavily skewed score may not show up, and every find is only a suggestion the user ticks.
 */
function repeatsAt(b: Bitmap, m: Measure, firstInRow: boolean): Side[] {
  const W = b.width, H = b.height;
  const x0 = Math.round(m.rect.x * W), x1 = Math.round((m.rect.x + m.rect.w) * W) - 1;
  const y0 = Math.round(m.rect.y * H), y1 = Math.round((m.rect.y + m.rect.h) * H) - 1;
  const staff = staffIn(b, x0, x1, y0, y1);
  if (!staff) return [];
  const { top, bottom, sp } = staff;
  const ty0 = Math.round(top), ty1 = Math.round(bottom);

  const full = (x: number) => { let n = 0; for (let y = ty0; y <= ty1; y++) if (dark(b, x, y)) n++; return n >= (ty1 - ty0 + 1) * 0.9; };
  const dot = (cx: number, cy: number) => {
    const r = Math.max(1, Math.round(sp * 0.12)); // a dot is about half a space across: look at its core
    let n = 0, all = 0;
    for (let y = Math.round(cy) - r; y <= Math.round(cy) + r; y++) for (let x = Math.round(cx) - r; x <= Math.round(cx) + r; x++) { all++; if (dark(b, x, y)) n++; }
    return n / all >= 0.6;
  };
  const dots = (cx: number) => dot(cx, top + 1.5 * sp) && dot(cx, top + 2.5 * sp);
  const dotsBetween = (a: number, z: number) => { for (let x = Math.round(a); x <= Math.round(z); x++) if (dots(x)) return true; return false; };

  const scan = (a: number, z: number): { start: boolean; end: boolean } => {
    const strokes: [number, number][] = [];
    for (let x = Math.max(0, Math.round(a)); x <= Math.min(W - 1, Math.round(z)); x++) {
      if (!full(x)) continue;
      let e = x;
      while (e + 1 <= z && full(e + 1)) e++;
      strokes.push([x, e]);
      x = e;
    }
    const thick = (s: [number, number]) => s[1] - s[0] + 1 >= Math.max(3, sp * 0.3);
    let start = false, end = false;
    for (const T of strokes.filter(thick)) {
      for (const S of strokes) {
        if (S === T || thick(S)) continue;
        if (S[1] < T[0] && T[0] - S[1] <= sp * 0.9 && dotsBetween(S[0] - sp * 1.3, S[0] - sp * 0.3)) end = true; // dots | thin | thick
        if (S[0] > T[1] && S[0] - T[1] <= sp * 0.9 && dotsBetween(S[1] + sp * 0.3, S[1] + sp * 1.3)) start = true; // thick | thin | dots
      }
    }
    return { start, end };
  };

  const out: Side[] = [];
  // the first box of a system opens after the clef and key signature, so its repeat sign can sit well inside the box
  const left = scan(x0 - sp, firstInRow ? x0 + Math.min((x1 - x0) * 0.45, sp * 14) : x0 + sp * 3);
  const right = scan(x1 - sp * 3, x1 + sp * 1.5);
  if (left.start) out.push('start');
  if (right.end) out.push('end');
  return out;
}

/** Repeat signs found on the page images (one bitmap per page that has boxes), as suggestions for the boxes that do not have them yet. */
export function suggestRepeats(measures: Measure[], bitmaps: Map<number, Bitmap>): Extract<Suggestion, { kind: 'repeat' }>[] {
  const found: Extract<Suggestion, { kind: 'repeat' }>[] = [];
  measures.forEach((m, i) => {
    const b = bitmaps.get(m.page);
    if (!b) return;
    // first box in its row: no other box ends where this one begins
    const prev = measures[i - 1];
    const firstInRow = !prev || prev.page !== m.page || Math.abs(prev.rect.x + prev.rect.w - m.rect.x) > 0.01 || Math.abs(prev.rect.y - m.rect.y) > m.rect.h / 2;
    for (const side of repeatsAt(b, m, firstInRow)) {
      if (side === 'start' ? m.marks?.repeatStart : m.marks?.repeatEnd) continue;
      found.push({ kind: 'repeat', measure: i, side, id: `repeat-${i}-${side}`, text: side === 'start' ? 'a repeat starts here (|:)' : 'a repeat ends here (:|), played twice' });
    }
  });
  return found;
}
