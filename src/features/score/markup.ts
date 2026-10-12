import type { Measure, Piece, Rect } from '../../shared/types';

/** Shift tempo/meter/ramp references after measures were inserted (+n) or removed (-n) at `index`, so events stay with their music. */
function shiftEvents(p: Piece, index: number, by: number, inclusive: boolean) {
  const moves = (at: number) => (inclusive ? at >= index : at > index);
  for (const e of [...p.meters, ...p.tempos]) if (moves(e.at)) e.at += by;
  for (const r of p.ramps) {
    if (moves(r.from)) r.from += by;
    if (r.to >= index) r.to += by;
  }
}

/** Insert measures at `index` (events at/after it move right). */
export function insertMeasures(p: Piece, index: number, ms: Measure[]) {
  p.measures.splice(index, 0, ...ms);
  shiftEvents(p, index, ms.length, true);
}

/** Split a measure at normalised x (0..1 of the page); false if x is outside it. */
export function splitMeasure(p: Piece, index: number, x: number, newId: string): boolean {
  const m = p.measures[index];
  if (!m || x <= m.rect.x || x >= m.rect.x + m.rect.w) return false;
  const rightW = m.rect.x + m.rect.w - x;
  p.measures.splice(index + 1, 0, { id: newId, page: m.page, rect: { ...m.rect, x, w: rightW } });
  m.rect = { ...m.rect, w: x - m.rect.x };
  // marks that belong to the end of the measure move to the right half; the rest stay on the left
  const { repeatEnd, toCoda, fine, jump, volta, partial, ...left } = m.marks ?? {};
  const right = { repeatEnd, toCoda, fine, jump, volta, partial };
  const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
  const lm = clean({ ...left, volta }), rm = clean(right);
  if (Object.keys(lm).length) m.marks = lm; else delete m.marks;
  if (Object.keys(rm).length) p.measures[index + 1].marks = rm;
  shiftEvents(p, index, 1, false);
  return true;
}

/** Remove a measure and keep events attached to the same music. */
export function removeMeasure(p: Piece, index: number) {
  p.measures.splice(index, 1);
  p.meters = p.meters.filter((e) => e.at !== index).map((e) => (e.at > index ? { ...e, at: e.at - 1 } : e));
  p.tempos = p.tempos.filter((e) => e.at !== index).map((e) => (e.at > index ? { ...e, at: e.at - 1 } : e));
  p.ramps = p.ramps
    .map((r) => ({ ...r, from: r.from > index ? r.from - 1 : r.from, to: r.to >= index ? r.to - 1 : r.to }))
    .filter((r) => r.to >= r.from && r.to < p.measures.length);
}

/** Index of the first measure after everything on `page`. */
const afterPage = (p: Piece, page: number) => {
  const i = p.measures.findIndex((m) => m.page > page);
  return i < 0 ? p.measures.length : i;
};

/**
 * Put freshly detected boxes on a page without throwing the user's work away: the n-th box on the page keeps its tempo,
 * time signature and repeat marks and only gets a new shape. Extra detected boxes are added after the page's last one,
 * and boxes left over are removed from the end. This is also how a click track made for one part of a score is reused
 * for another part's PDF.
 */
export function replaceBoxes(p: Piece, page: number, rects: Rect[]): { kept: number; added: number; removed: number } {
  const on = p.measures.flatMap((m, i) => (m.page === page ? [i] : []));
  const kept = Math.min(on.length, rects.length);
  for (let j = 0; j < kept; j++) p.measures[on[j]].rect = rects[j];
  if (rects.length > on.length) {
    const at = on.length ? on[on.length - 1] + 1 : afterPage(p, page);
    insertMeasures(p, at, rects.slice(on.length).map((rect) => ({ id: crypto.randomUUID(), page, rect })));
  } else {
    for (let j = on.length - 1; j >= rects.length; j--) removeMeasure(p, on[j]);
  }
  return { kept, added: Math.max(0, rects.length - on.length), removed: Math.max(0, on.length - rects.length) };
}

/** True when the first box is much narrower than the others in its system: probably an upbeat (pickup) bar. */
export function looksLikePickup(p: Piece): boolean {
  const first = p.measures[0];
  if (!first || first.marks?.pickup) return false;
  const peers = p.measures.slice(1).filter((m) => m.page === first.page && Math.abs(m.rect.y - first.rect.y) < first.rect.h / 2);
  if (peers.length < 2) return false;
  const widths = peers.map((m) => m.rect.w).sort((a, b) => a - b);
  return first.rect.w < widths[Math.floor(widths.length / 2)] * 0.6;
}

/** Join a measure with the one after it (a barline that was found by mistake). False if they are not on the same page. */
export function mergeMeasures(p: Piece, index: number): boolean {
  const a = p.measures[index], b = p.measures[index + 1];
  if (!a || !b || a.page !== b.page) return false;
  const x0 = Math.min(a.rect.x, b.rect.x), y0 = Math.min(a.rect.y, b.rect.y);
  const x1 = Math.max(a.rect.x + a.rect.w, b.rect.x + b.rect.w), y1 = Math.max(a.rect.y + a.rect.h, b.rect.y + b.rect.h);
  // the merged measure ends where b ended, so b's end-of-measure marks come along; a's start marks stay
  const { repeatEnd, toCoda, fine, jump, volta, partial } = b.marks ?? {};
  const { repeatEnd: _r, toCoda: _t, fine: _f, jump: _j, volta: _v, partial: _p, ...start } = a.marks ?? {};
  const marks = Object.fromEntries(Object.entries({ ...start, repeatEnd, toCoda, fine, jump, volta, partial }).filter(([, v]) => v !== undefined));
  a.rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  if (Object.keys(marks).length) a.marks = marks; else delete a.marks;
  removeMeasure(p, index + 1); // events that sat on the second box go with it
  return true;
}

export type Edge = 'left' | 'right' | 'top' | 'bottom';
const MIN = 0.004; // smallest box side, in page fractions
const NEIGHBOUR = 0.006; // two edges closer than this are the same barline

const sharesBarline = (a: Rect, b: Rect) => {
  const overlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return Math.abs(a.x + a.w - b.x) < NEIGHBOUR && overlap > Math.min(a.h, b.h) * 0.5;
};

/**
 * Move one edge of a box by `delta` (page fractions). A barline shared with the neighbouring box moves both, so dragging a bar
 * resizes the two measures around it. The box stays on the page and keeps a minimum size.
 */
export function dragEdge(p: Piece, index: number, edge: Edge, delta: number) {
  const m = p.measures[index];
  if (!m) return;
  const r = m.rect;
  if (edge === 'top' || edge === 'bottom') {
    if (edge === 'top') { const y = Math.min(r.y + r.h - MIN, Math.max(0, r.y + delta)); m.rect = { ...r, y, h: r.h - (y - r.y) }; }
    else m.rect = { ...r, h: Math.max(MIN, Math.min(1 - r.y, r.h + delta)) };
    return;
  }
  const next = edge === 'right' ? p.measures[index + 1] : p.measures[index - 1];
  const shared = next && next.page === m.page && (edge === 'right' ? sharesBarline(r, next.rect) : sharesBarline(next.rect, r)) ? next : undefined;
  // the room each side has to give, so that both boxes stay valid
  let d = delta;
  if (edge === 'right') {
    d = Math.max(-(r.w - MIN), Math.min(1 - (r.x + r.w), d));
    if (shared) d = Math.min(shared.rect.w - MIN, d);
    m.rect = { ...r, w: r.w + d };
    if (shared) shared.rect = { ...shared.rect, x: shared.rect.x + d, w: shared.rect.w - d };
  } else {
    d = Math.min(r.w - MIN, Math.max(-r.x, d));
    if (shared) d = Math.max(-(shared.rect.w - MIN), d);
    m.rect = { ...r, x: r.x + d, w: r.w - d };
    if (shared) shared.rect = { ...shared.rect, w: shared.rect.w + d };
  }
}

/** Move a whole box, keeping it on the page. */
export function moveBox(p: Piece, index: number, dx: number, dy: number) {
  const m = p.measures[index];
  if (!m) return;
  m.rect = { ...m.rect, x: Math.min(1 - m.rect.w, Math.max(0, m.rect.x + dx)), y: Math.min(1 - m.rect.h, Math.max(0, m.rect.y + dy)) };
}

// ---- outlining: boxes that line up with their neighbours ----

const SNAP = 0.012; // an edge this close to a neighbour's is pulled onto it (page fractions)
const TIDY_GAP = 0.03; // gaps and overlaps smaller than this between two bars in a row count as "the same barline"

const overlapY = (a: Rect, b: Rect) => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
/** The boxes in the same row (system) as `r`: they overlap it vertically by more than half of the shorter one. */
const sameRow = (r: Rect, others: Rect[]) => others.filter((o) => overlapY(r, o) > Math.min(r.h, o.h) * 0.5);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const nearest = (v: number, candidates: number[], tol: number) =>
  candidates.reduce<number | undefined>((best, c) => (Math.abs(c - v) < tol && (best === undefined || Math.abs(c - v) < Math.abs(best - v)) ? c : best), undefined);

/**
 * A freshly drawn box takes the top and height of the boxes already in its row, and its left and right edges connect to the
 * barline of a neighbour that is close, so the bars of a system end up the same size and touching.
 */
export function outlineRect(rect: Rect, others: Rect[]): Rect {
  const peers = sameRow(rect, others);
  if (!peers.length) return rect;
  const left = nearest(rect.x, peers.map((o) => o.x + o.w), SNAP) ?? rect.x;
  const right = nearest(rect.x + rect.w, peers.map((o) => o.x), SNAP) ?? rect.x + rect.w;
  const [x, w] = right - left >= MIN ? [left, right - left] : [rect.x, rect.w];
  return { x, y: median(peers.map((o) => o.y)), w, h: median(peers.map((o) => o.h)) };
}

/**
 * After a drag: settle the box's top, bottom and sides onto the edges of the boxes in its row when they are within reach.
 * Unlike outlineRect this never forces a size, so a box that was made taller on purpose stays taller.
 */
export function snapBox(p: Piece, index: number) {
  const m = p.measures[index];
  if (!m) return;
  const peers = sameRow(m.rect, p.measures.filter((o, i) => i !== index && o.page === m.page).map((o) => o.rect));
  if (!peers.length) return;
  let { x, y, w, h } = m.rect;
  const top = nearest(y, peers.map((o) => o.y), SNAP);
  if (top !== undefined) { h += y - top; y = top; }
  const bottom = nearest(y + h, peers.map((o) => o.y + o.h), SNAP);
  if (bottom !== undefined) h = bottom - y;
  const left = nearest(x, peers.map((o) => o.x + o.w), SNAP);
  if (left !== undefined) { w += x - left; x = left; }
  const right = nearest(x + w, peers.map((o) => o.x), SNAP);
  if (right !== undefined) w = right - x;
  if (w >= MIN && h >= MIN) m.rect = { x, y, w, h };
}

/**
 * Make a whole row of boxes consistent: the same top and height (the median), and small gaps or overlaps between neighbouring
 * bars closed at their midpoint. Returns how many boxes changed.
 */
export function tidyRow(p: Piece, index: number): number {
  const base = p.measures[index];
  if (!base) return 0;
  const row = p.measures.filter((m) => m.page === base.page && overlapY(base.rect, m.rect) > Math.min(base.rect.h, m.rect.h) * 0.5);
  const before = row.map((m) => m.rect);
  const y = median(row.map((m) => m.rect.y)), h = median(row.map((m) => m.rect.h));
  const sorted = [...row].sort((a, b) => a.rect.x - b.rect.x);
  for (const m of sorted) m.rect = { ...m.rect, y, h };
  for (let k = 0; k + 1 < sorted.length; k++) {
    const a = sorted[k].rect, b = sorted[k + 1].rect;
    const gap = b.x - (a.x + a.w);
    if (Math.abs(gap) >= TIDY_GAP || Math.abs(gap) < 1e-9) continue; // a real break between two groups of bars, or already touching
    const mid = (a.x + a.w + b.x) / 2;
    if (mid - a.x < MIN || b.x + b.w - mid < MIN) continue;
    sorted[k].rect = { ...a, w: mid - a.x };
    sorted[k + 1].rect = { ...b, x: mid, w: b.x + b.w - mid };
  }
  const same = (a: Rect, b: Rect) => (['x', 'y', 'w', 'h'] as const).every((k) => Math.abs(a[k] - b[k]) < 1e-9);
  return row.filter((m, i) => !same(m.rect, before[i])).length;
}
