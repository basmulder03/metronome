import type { Rect } from '../../shared/types';

export type Bitmap = { data: Uint8ClampedArray; width: number; height: number };

const dark = (b: Bitmap, x: number, y: number) => {
  const i = (y * b.width + x) * 4;
  return b.data[i + 3] > 0 && (b.data[i] + b.data[i + 1] + b.data[i + 2]) / 3 < 140;
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
 * Find measure boxes (normalised, in reading order) from a rendered page.
 * Classical image processing, no ML: staff lines via a row histogram, barlines as columns dark across every staff of a system.
 * Heuristic: expect misses on dense scores (hand-written, skewed, overlapping notation); the editor is where those get fixed.
 */
export function detectMeasures(b: Bitmap): Rect[] {
  const { width: W, height: H } = b;
  const rowDark = new Array<number>(H).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dark(b, x, y)) rowDark[y]++;
  const maxRow = Math.max(...rowDark);
  if (maxRow < W * 0.2) return [];

  // 1. staff lines: rows that are dark across a large share of the widest line
  const lines = runs(H, (y) => rowDark[y] > maxRow * 0.5).map(([a, z]) => (a + z) / 2);
  if (lines.length < 5) return [];
  const gaps = lines.slice(1).map((v, i) => v - lines[i]).sort((p, q) => p - q);
  const sp = gaps[Math.floor(gaps.length / 4)]; // staff-line spacing: lower quartile ignores the gaps between staves

  // 2. staves = lines spaced about `sp` apart; systems = staves closer than 8 spacings (grand staff)
  const staves: [number, number][] = [];
  for (const y of lines) {
    const s = staves.at(-1);
    if (s && y - s[1] < sp * 1.6) s[1] = y; else staves.push([y, y]);
  }
  const good = staves.filter(([a, z]) => z - a > sp * 3); // drop stray rules (text underlines, etc.)
  const systems: [number, number][][] = [];
  for (const s of good) {
    const g = systems.at(-1);
    if (g && s[0] - g.at(-1)![1] < sp * 8) g.push(s); else systems.push([s]);
  }

  const out: Rect[] = [];
  for (const sys of systems) {
    // x extent of the system = columns where the top staff's lines are dark
    const [t0, t1] = sys[0];
    const ink = (x: number) => dark(b, x, Math.round(t0)) || dark(b, x, Math.round((t0 + t1) / 2)) || dark(b, x, Math.round(t1));
    const xr = runs(W, ink).sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0];
    if (!xr) continue;
    const [xs, xe] = xr;

    // 3. barline: column that is dark for >=90% of the height of every staff in the system
    const isBar = (x: number) => sys.every(([a, z]) => {
      let n = 0;
      const y0 = Math.round(a), y1 = Math.round(z);
      for (let y = y0; y <= y1; y++) if (dark(b, x, y)) n++;
      return n >= (y1 - y0 + 1) * 0.9;
    });
    const bars = runs(xe - xs + 1, (i) => isBar(xs + i)).map(([a, z]) => xs + (a + z) / 2);

    // 4. boundaries: system edges plus barlines, merging any closer than 3 spacings (double/thick barlines, repeat dots)
    const bounds = [xs];
    for (const x of [...bars, xe]) if (x - bounds.at(-1)! >= sp * 3) bounds.push(x);
    if (bounds.length < 2) continue;
    bounds[bounds.length - 1] = xe;
    // The opening barline splits off the clef/key/time-signature header; a first interval much narrower than the rest is that header.
    if (bounds.length > 3) {
      const w = bounds.slice(2).map((x, i) => x - bounds[i + 1]).sort((p, q) => p - q);
      if (bounds[1] - bounds[0] < w[Math.floor(w.length / 2)] * 0.6) bounds.splice(1, 1);
    }

    const top = sys[0][0] - sp * 1.5, bot = sys.at(-1)![1] + sp * 1.5;
    for (let i = 0; i + 1 < bounds.length; i++) {
      out.push({ x: bounds[i] / W, y: top / H, w: (bounds[i + 1] - bounds[i]) / W, h: (bot - top) / H });
    }
  }
  return out;
}
