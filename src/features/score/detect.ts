import type { Rect } from '../../shared/types';

export type Bitmap = { data: Uint8ClampedArray; width: number; height: number };

// Thin printed lines turn mid-grey when a scan is shrunk to screen size, so "dark" has to be generous. Barlines still need to be
// dark along the whole staff height, which keeps noise from counting.
const DARK = 200;
const dark = (b: Bitmap, x: number, y: number) => {
  const i = (y * b.width + x) * 4;
  return b.data[i + 3] > 0 && (b.data[i] + b.data[i + 1] + b.data[i + 2]) / 3 < DARK;
};

/** Consecutive indices where `on` is true -> [start, end] runs. */
function runs(n: number, on: (i: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    if (!on(i)) continue;
    let j = i;
    while (j + 1 < n && on(j + 1)) j++;
    out.push([i, j]);
    i = j;
  }
  return out;
}

/**
 * How much a scan is tilted, as a vertical shear (rows moved per column): the slope at which the dark pixels pile up into the
 * sharpest horizontal lines. A shear (not a rotation) because it straightens the staff lines but leaves every column, and so every
 * barline, where it is. 0 when the page is already straight.
 */
function estimateSlope(b: Bitmap): number {
  const { width: W, height: H } = b;
  const pad = Math.ceil(W * 0.03) + 2;
  const points: number[] = [];
  const stride = Math.max(1, Math.floor((W * H) / 400_000)); // enough dark pixels to find the lines, bounded for speed
  for (let y = 0, k = 0; y < H; y++) for (let x = 0; x < W; x++) if (dark(b, x, y) && k++ % stride === 0) points.push(x, y);
  const score = (s: number) => {
    const hist = new Uint32Array(H + 2 * pad);
    for (let i = 0; i < points.length; i += 2) hist[Math.round(points[i + 1] - points[i] * s) + pad]++;
    let sum = 0;
    for (const c of hist) sum += c * c;
    return sum;
  };
  let best = 0, bestScore = score(0);
  for (let s = -0.02; s <= 0.02; s += 0.001) { const v = score(s); if (v > bestScore) { best = s; bestScore = v; } }
  const coarse = best;
  for (let s = coarse - 0.001; s <= coarse + 0.001; s += 0.0002) { const v = score(s); if (v > bestScore) { best = s; bestScore = v; } }
  return Math.abs(best) < 0.0007 || bestScore < score(0) * 1.03 ? 0 : best; // not worth moving pixels for a tiny or unconvincing tilt
}

/** The page with every row moved by slope*x, so that tilted staff lines become level. */
function shear(b: Bitmap, slope: number): Bitmap {
  const { width: W, height: H } = b;
  const data = new Uint8ClampedArray(b.data.length).fill(255);
  for (let x = 0; x < W; x++) {
    const dy = Math.round(x * slope);
    for (let y = 0; y < H; y++) {
      const from = y + dy;
      if (from < 0 || from >= H) continue;
      const i = (from * W + x) * 4, o = (y * W + x) * 4;
      data[o] = b.data[i]; data[o + 1] = b.data[i + 1]; data[o + 2] = b.data[i + 2]; data[o + 3] = b.data[i + 3];
    }
  }
  return { data, width: W, height: H };
}

/**
 * Is this dark column run a barline? A barline stops at the staff lines and has nothing attached. A stem runs past the staff
 * (`outer`: only the ends of the whole system are checked, because barlines legitimately continue between the staves of a grand
 * staff) or carries a notehead or beam, which shows as a horizontal dark run touching its side away from the staff lines.
 */
function isBarline(b: Bitmap, [x0, x1]: [number, number], staves: [number, number][], sp: number, lineRows: number[], lineHalf: number): boolean {
  const xm = Math.round((x0 + x1) / 2);
  const top = Math.round(staves[0][0]), bottom = Math.round(staves.at(-1)![1]);
  let up = 0, down = 0;
  while (up < sp * 2 && dark(b, xm, top - 1 - up)) up++;
  while (down < sp * 2 && dark(b, xm, bottom + 1 + down)) down++;
  if (up > sp * 0.5 || down > sp * 0.5) return false;

  const reach = Math.max(3, Math.round(sp * 0.7));
  let attached = 0;
  for (const [a, z] of staves) {
    for (let y = Math.round(a); y <= Math.round(z); y++) {
      if (lineRows.some((l) => Math.abs(l - y) <= lineHalf)) continue; // the staff lines themselves touch every barline
      let left = 0, right = 0;
      while (left < reach && x0 - 1 - left >= 0 && dark(b, x0 - 1 - left, y)) left++;
      while (right < reach && x1 + 1 + right < b.width && dark(b, x1 + 1 + right, y)) right++;
      if (left >= reach || right >= reach) attached++;
    }
  }
  return attached < 3;
}

/**
 * Find measure boxes (normalised, in reading order) from a rendered page.
 * Classical image processing, no ML: staff lines via a row histogram, barlines as columns dark across every staff of a system.
 * Heuristic: expect misses on dense scores (hand-written, skewed, overlapping notation); the editor is where those get fixed.
 */
export function detectMeasures(original: Bitmap): Rect[] {
  const slope = estimateSlope(original);
  const b = slope ? shear(original, slope) : original; // everything below works on level staff lines
  const { width: W, height: H } = b;
  const rowDark = new Array<number>(H).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dark(b, x, y)) rowDark[y]++;
  const maxRow = Math.max(...rowDark);
  if (maxRow < W * 0.2) return [];

  // 1. staff lines: rows that are dark across a large share of the widest line
  const lines = runs(H, (y) => rowDark[y] > maxRow * 0.5).map(([a, z]) => (a + z) / 2);
  if (lines.length < 5) return [];
  const lineRuns = runs(H, (y) => rowDark[y] > maxRow * 0.5).map(([a, z]) => z - a + 1).sort((p, q) => p - q);
  const lineHalf = Math.ceil(lineRuns[Math.floor(lineRuns.length / 2)] / 2) + 1; // how far from a line's centre still counts as the line
  const gaps = lines.slice(1).map((v, i) => v - lines[i]).sort((p, q) => p - q);
  const sp = gaps[Math.floor(gaps.length / 4)]; // staff-line spacing: lower quartile ignores the gaps between staves

  // 2. staves: five lines spaced about `sp` apart. Beams and rests also make dark rows, but not at staff spacing, so a beam just
  // below a staff must not stretch it (barlines would then look too short). Systems = staves closer than 8 spacings (grand staff).
  const staves: [number, number][] = [];
  let seq: number[] = [];
  const closeSeq = () => {
    if (seq.length >= 5) {
      // more than five rows in a row (a beam near the staff): keep the five that are most evenly spaced
      let best = 0, bestSpread = Infinity;
      for (let i = 0; i + 5 <= seq.length; i++) {
        const w = seq.slice(i, i + 5);
        const spread = Math.max(...w.slice(1).map((v, k) => Math.abs(v - w[k] - sp)));
        if (spread < bestSpread) { best = i; bestSpread = spread; }
      }
      staves.push([seq[best], seq[best + 4]]);
    } else if (seq.length === 4) staves.push([seq[0], seq[0] + sp * 4]); // one faint line: still a staff
    seq = [];
  };
  for (const y of lines) {
    if (seq.length && (y - seq.at(-1)! < sp * 0.7 || y - seq.at(-1)! > sp * 1.35)) closeSeq();
    seq.push(y);
  }
  closeSeq();
  const systems: [number, number][][] = [];
  for (const s of staves) {
    const g = systems.at(-1);
    if (g && s[0] - g.at(-1)![1] < sp * 8) g.push(s); else systems.push([s]);
  }

  type Pending = { bounds: number[]; widthAt: Map<number, number>; top: number; bot: number };
  const pending: Pending[] = [];
  for (const sys of systems) {
    // x extent of the system: columns with ink somewhere in the top staff's band (not on three exact rows, which a slightly
    // tilted or curved scan slips off), bridging small breaks such as a faint stretch of line
    const [t0, t1] = sys[0];
    const bandTop = Math.round(t0) - 2, bandBottom = Math.round(t1) + 2;
    const ink = (x: number) => {
      let n = 0;
      for (let y = bandTop; y <= bandBottom; y++) if (dark(b, x, y)) n++;
      return n >= 3; // three of the five lines is still a staff: a faint stretch must not cut the system short
    };
    const merged: [number, number][] = [];
    for (const r of runs(W, ink)) {
      const last = merged.at(-1);
      if (last && r[0] - last[1] <= sp * 2) last[1] = r[1]; else merged.push([r[0], r[1]]);
    }
    const xr = merged.sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0];
    if (!xr) continue;
    const [xs, xe] = xr;

    // 3. barline: column that is dark for >=90% of the height of every staff in the system
    const isBar = (x: number) => sys.every(([a, z]) => {
      let n = 0;
      const y0 = Math.round(a), y1 = Math.round(z);
      for (let y = y0; y <= y1; y++) if (dark(b, x, y)) n++;
      return n >= (y1 - y0 + 1) * 0.9;
    });
    const found = runs(xe - xs + 1, (i) => isBar(xs + i)).map(([a, z]) => [xs + a, xs + z] as [number, number]);
    // a stem passes the coverage test too: keep only runs that stop at the staff and have nothing attached
    const clean = found.filter((r) => isBarline(b, r, sys, sp, lines, lineHalf));
    const chosen = clean.length >= 2 ? clean : found;
    const candidates = chosen.map(([a, z]) => (a + z) / 2);
    const widthAt = new Map(chosen.map(([a, z]) => [(a + z) / 2, z - a + 1]));
    // A stem can span one staff, but only a real barline also bridges the gap between the staves of a grand staff.
    const bridges = (x: number) => sys.slice(1).every(([a], k) => {
      const y0 = Math.round(sys[k][1]), y1 = Math.round(a);
      let n = 0;
      for (let y = y0; y <= y1; y++) if (dark(b, Math.round(x), y)) n++;
      return n >= (y1 - y0 + 1) * 0.9;
    });
    const connected = sys.length > 1 ? candidates.filter(bridges) : candidates;
    const bars = connected.length >= 2 ? connected : candidates; // engravings without connected barlines keep every candidate

    // 4. boundaries: system edges plus barlines, merging any closer than 3 spacings (double/thick barlines, repeat dots)
    const bounds = [xs];
    for (const x of [...bars, xe]) if (x - bounds.at(-1)! >= sp * 3) bounds.push(x);
    if (bounds.length < 2) continue;
    bounds[bounds.length - 1] = xe;
    pending.push({ bounds, widthAt, top: sys[0][0] - sp * 1.5, bot: sys.at(-1)![1] + sp * 1.5 });
  }

  // How thick an ordinary barline is on this page: a scan's thin lines can be 3 px, a clean render's 1 px, so "heavy" is relative.
  const widths = pending.flatMap((p) => [...p.widthAt.values()]).sort((p, q) => p - q);
  const typical = widths[Math.floor(widths.length / 2)] ?? 1;

  const out: Rect[] = [];
  for (const { bounds, widthAt, top, bot } of pending) {
    // A heavy opening barline splits off the clef/key/time-signature header; a first interval much narrower than the rest is then
    // just that header. An ordinary-weight first barline is a real bar line (the first bar may simply be short, say a rest).
    if (bounds.length > 3 && (widthAt.get(bounds[1]) ?? 0) >= typical * 1.6) {
      const w = bounds.slice(2).map((x, i) => x - bounds[i + 1]).sort((p, q) => p - q);
      if (bounds[1] - bounds[0] < w[Math.floor(w.length / 2)] * 0.6) bounds.splice(1, 1);
    }
    for (let i = 0; i + 1 < bounds.length; i++) {
      // back from the straightened page to the original: a box sits `slope` rows lower per column it is to the right
      const lift = ((bounds[i] + bounds[i + 1]) / 2) * slope;
      out.push({ x: bounds[i] / W, y: (top + lift) / H, w: (bounds[i + 1] - bounds[i]) / W, h: (bot - top) / H });
    }
  }
  return out;
}
