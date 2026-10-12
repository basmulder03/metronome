import type { Measure, Piece } from '../../shared/types';

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
  const { repeatEnd, toCoda, fine, jump, volta, ...left } = m.marks ?? {};
  const right = { repeatEnd, toCoda, fine, jump, volta };
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
