import type { Curve, Meter, Piece, Unit } from '../../shared/types';
import { unroll } from '../structure/unroll';
import { DEFAULT_BPM, DEFAULT_METER, DEFAULT_UNIT } from '../../shared/types';

/** Click kind: 2 = downbeat, 1 = start of a beat group, 0 = subdivision. */
export type Beat = { time: number; measure: number; step: number; accent: 0 | 1 | 2 };
/** One step per measure as played, so a repeated measure appears twice. */
export type Timeline = { beats: Beat[]; steps: { measure: number; time: number }[]; measureCount: number; duration: number };

/** Quarter notes per beat-unit: BPM in `unit` -> quarter-notes per minute is bpm * this. */
export const unitQuarters = (u: Unit) => (4 / u.den) * (u.dotted ? 1.5 : 1);

export function parseGrouping(text: string, num: number): number[] | null {
  const g = text.split(/[+\s,]+/).filter(Boolean).map(Number);
  return g.length && g.every((n) => Number.isInteger(n) && n > 0) && g.reduce((a, b) => a + b) === num ? g : null;
}

/** Default accent grouping: 3s for compound meters (6, 9, 12 over 8/16), otherwise one beat per unit. */
export function defaultGrouping(num: number, den: number): number[] {
  return den >= 8 && num % 3 === 0 && num > 3 ? Array(num / 3).fill(3) : Array(num).fill(1);
}

/** Evaluate a cubic-bezier easing at progress p in 0..1. */
export function ease(c: Curve, p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const [x1, y1, x2, y2] = c;
  const bez = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (bez(mid, x1, x2) < p) lo = mid; else hi = mid;
  }
  return bez((lo + hi) / 2, y1, y2);
}

const last = <T extends { at: number }>(list: T[], m: number) =>
  list.filter((e) => e.at <= m).reduce<T | undefined>((a, e) => (!a || e.at >= a.at ? e : a), undefined);

/** Accent for each beat position of a meter. */
export function accentsOf(mt: Meter): (0 | 1 | 2)[] {
  const starts = new Set(mt.grouping.reduce<number[]>((a, g) => [...a, (a.at(-1) ?? 0) + g], [0]));
  return Array.from({ length: mt.num }, (_, k) => (k === 0 ? 2 : starts.has(k) ? 1 : 0));
}

/** Count-in clicks as beats with times relative to beat i0 (negative), using that measure's meter and first beat length. */
export function countIn(p: Piece, tl: Timeline, i0: number, bars: number): Beat[] {
  const b0 = tl.beats[i0];
  if (!b0 || bars <= 0) return [];
  const mt = meterAt(p, b0.measure);
  const next = tl.beats[i0 + 1];
  const unit = next ? next.time - b0.time : 0.6;
  const accents = accentsOf(mt);
  const out: Beat[] = [];
  for (let i = 0; i < bars * mt.num; i++) out.push({ time: -(bars * mt.num - i) * unit, measure: b0.measure, step: -1, accent: accents[i % mt.num] });
  return out;
}

export const meterAt = (p: Piece, m: number): Meter => last(p.meters, m)?.meter ?? DEFAULT_METER;

/** The ramp that covers measure m, if any. Ramps may not overlap: the timeline would only honour the first. */
export const rampCovering = (p: Piece, m: number) => p.ramps.find((r) => r.from <= m && m <= r.to);

/** Last measure a ramp starting at `from` may reach without running into the next ramp. */
export const maxRampEnd = (p: Piece, from: number) =>
  Math.min(p.measures.length - 1, ...p.ramps.filter((r) => r.from > from).map((r) => r.from - 1));

/** The tempo event in force at measure m (ramps do not count). */
export const tempoAt = (p: Piece, m: number) => last(p.tempos, m);

const SUBSTEPS = 16;

export function buildTimeline(p: Piece): Timeline {
  const n = p.measures.length;
  const meters = Array.from({ length: n }, (_, m) => meterAt(p, m));
  const present = (m: number) => Math.min(meters[m].num, Math.max(1, p.measures[m].marks?.pickup ?? meters[m].num));
  const lenQ = meters.map((mt, m) => (present(m) * 4) / mt.den);
  const startQ: number[] = [];
  lenQ.reduce((acc, l, m) => ((startQ[m] = acc), acc + l), 0);

  // Piecewise-constant base tempo (quarters/min); a ramp's end value carries on after it unless a tempo event overrides.
  const base: { at: number; qpm: number }[] = [];
  for (const t of p.tempos) base.push({ at: t.at, qpm: t.bpm * unitQuarters(t.unit) });
  for (const r of p.ramps) {
    const t = tempoAt(p, r.from);
    base.unshift({ at: r.to + 1, qpm: r.endBpm * unitQuarters(t?.unit ?? DEFAULT_UNIT) });
  }
  base.sort((a, b) => a.at - b.at); // stable: explicit tempo events stay after a ramp end at the same measure
  const baseAt = (m: number) => base.filter((e) => e.at <= m).at(-1)?.qpm ?? DEFAULT_BPM * unitQuarters(DEFAULT_UNIT);

  const rampOf = (m: number) => p.ramps.find((r) => r.from <= m && m <= r.to && r.to < n);
  const qpmAt = (m: number, q: number) => {
    const r = rampOf(m);
    if (!r) return baseAt(m);
    const u = unitQuarters(tempoAt(p, r.from)?.unit ?? DEFAULT_UNIT);
    const span = startQ[r.to] + lenQ[r.to] - startQ[r.from];
    return (r.startBpm + (r.endBpm - r.startBpm) * ease(r.curve, (q - startQ[r.from]) / span)) * u;
  };

  const beats: Beat[] = [];
  const steps: Timeline['steps'] = [];
  let time = 0;
  for (const [s, m] of unroll(p.measures).entries()) {
    steps.push({ measure: m, time });
    const { num, den } = meters[m];
    const step = 4 / den;
    const accents = accentsOf(meters[m]);
    const first = num - present(m); // a pickup measure sounds only the last beats of the meter
    const fermata = p.measures[m].marks?.fermata;
    for (let k = first; k < num; k++) {
      beats.push({ time, measure: m, step: s, accent: accents[k] });
      // midpoint rule over the step: 60/qpm integrated across the quarter-note span
      const h = step / SUBSTEPS;
      let dt = 0;
      for (let j = 0; j < SUBSTEPS; j++) dt += (60 / qpmAt(m, startQ[m] + (k - first) * step + (j + 0.5) * h)) * h;
      time += fermata?.beat === k ? dt * Math.max(1, fermata.factor) : dt;
    }
  }
  return { beats, steps, measureCount: n, duration: time };
}
