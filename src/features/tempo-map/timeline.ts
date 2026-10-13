import type { Curve, Meter, Piece, Unit } from '../../shared/types';
import { barsIn } from '../structure/bars';
import { type Part, partIndexOf, partsOf } from '../structure/parts';
import { unroll } from '../structure/unroll';
import { DEFAULT_BPM, DEFAULT_METER, DEFAULT_UNIT } from '../../shared/types';

/** Click kind: 2 = downbeat, 1 = start of a beat group, 0 = subdivision. */
export type Beat = { time: number; measure: number; step: number; accent: 0 | 1 | 2 };
/** One step per measure as played, so a repeated measure appears twice. */
export type Timeline = {
  beats: Beat[];
  steps: { measure: number; time: number }[];
  measureCount: number;
  duration: number;
  /** The parts of the sheet (empty if it has none) and, for each played step, which one it is in (-1 for none). */
  parts: Part[];
  partOfStep: number[];
};

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
  // A pickup completes the count: for N beats of pickup the count-in is N beats shorter, so "1 2 3" is followed by the pickup on "4".
  const [start] = spanOf(p, b0.measure); // the pickup sits on beat `start` of the bar, so the count supplies the beats before it
  const total = bars * mt.num - (start > 0 ? mt.num - start : 0);
  const out: Beat[] = [];
  for (let i = 0; i < total; i++) out.push({ time: -(total - i) * unit, measure: b0.measure, step: -1, accent: accents[i % mt.num] });
  return out;
}

/**
 * The beats of measure m's meter that are written, as [start, end). A pickup (upbeat) starts late: the last N beats of the meter.
 * A short bar ends early: the first N beats. Anything else is the whole bar.
 */
export function spanOf(p: Piece, m: number): [number, number] {
  const { num } = meterAt(p, m);
  const k = p.measures[m]?.marks;
  const start = k?.pickup && k.pickup < num ? num - Math.max(1, k.pickup) : 0;
  const end = k?.partial && k.partial < num ? Math.max(1, k.partial) : num;
  return start < end ? [start, end] : [0, num];
}

/**
 * The played step after which playback should stop when it starts at `fromStep`, or undefined to play to the end.
 * Parts end where the played order moves into a different part, so a repeat inside a part does not stop it, and a jump back
 * (D.C.) ends the part it leaves. `stop` is the piece's "stop after each part" setting; a part flagged `pause` stops either way.
 */
export function stopStepFrom(tl: Timeline, fromStep: number, mode: 'continue' | 'stop'): number | undefined {
  for (let s = fromStep; s < tl.steps.length - 1; s++) {
    const a = tl.partOfStep[s], b = tl.partOfStep[s + 1];
    if (a >= 0 && a !== b && (mode === 'stop' || tl.parts[a].pause)) return s;
  }
  return undefined;
}

/** First played step of a written measure. */
export const firstStepOf = (tl: Timeline, measure: number) => Math.max(0, tl.steps.findIndex((s) => s.measure === measure));

export const meterAt = (p: Piece, m: number): Meter => last(p.meters, m)?.meter ?? DEFAULT_METER;

/** The ramp that covers measure m, if any. Ramps may not overlap: the timeline would only honour the first. */
export const rampCovering = (p: Piece, m: number) => p.ramps.find((r) => r.from <= m && m <= r.to);

/** Last measure a ramp starting at `from` may reach without running into the next ramp. */
export const maxRampEnd = (p: Piece, from: number) =>
  Math.min(p.measures.length - 1, ...p.ramps.filter((r) => r.from > from).map((r) => r.from - 1));

/** The tempo event in force at measure m (ramps do not count). */
export const tempoAt = (p: Piece, m: number) => last(p.tempos, m);

const SUBSTEPS = 16;

/** `speed`: 1 plays as written, 0.5 half as fast (every time is stretched; the music itself is not changed). */
export function buildTimeline(p: Piece, speed = 1): Timeline {
  const n = p.measures.length;
  const meters = Array.from({ length: n }, (_, m) => meterAt(p, m));
  const rests = p.measures.map(barsIn); // a multi-measure rest is several whole bars under one box
  const spans = p.measures.map((_, m) => (rests[m] > 1 ? ([0, meters[m].num] as [number, number]) : spanOf(p, m)));
  const lenQ = meters.map((mt, m) => (rests[m] * (spans[m][1] - spans[m][0]) * 4) / mt.den);
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
    const { den } = meters[m];
    const step = 4 / den;
    const accents = accentsOf(meters[m]);
    const [first, last] = spans[m]; // a pickup sounds only the last beats of the meter, a short bar only the first
    const fermata = p.measures[m].marks?.fermata;
    for (let bar = 0; bar < rests[m]; bar++) for (let k = first; k < last; k++) {
      beats.push({ time, measure: m, step: s, accent: accents[k] });
      // midpoint rule over the step: 60/qpm integrated across the quarter-note span
      const h = step / SUBSTEPS;
      let dt = 0;
      for (let j = 0; j < SUBSTEPS; j++) dt += (60 / qpmAt(m, startQ[m] + (bar * (last - first) + (k - first)) * step + (j + 0.5) * h)) * h;
      time += fermata?.beat === k && rests[m] === 1 ? dt * Math.max(1, fermata.factor) : dt;
    }
  }
  const parts = partsOf(p.measures);
  const k = 1 / Math.min(4, Math.max(0.25, speed || 1));
  if (k !== 1) { for (const b of beats) b.time *= k; for (const st of steps) st.time *= k; time *= k; }
  return { beats, steps, measureCount: n, duration: time, parts, partOfStep: steps.map((s) => partIndexOf(parts, s.measure)) };
}
