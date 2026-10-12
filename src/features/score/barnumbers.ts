import type { Measure } from '../../shared/types';
import { barsIn } from '../structure/bars';
import { partsOf } from '../structure/parts';
import type { Suggestion, TextItem } from './readmarks';

/** A bar number printed above a measure box (a rehearsal mark such as [24]), read from the page. */
export type Printed = { measure: number; n: number };
/** One box that is a multi-measure rest, with the count read from the digits over it (if any). */
export type RestBox = { measure: number; guess?: number };

export type Solved = {
  /** Bars each rest box stands for, by measure index. */
  counts: Map<number, number>;
  /** Printed numbers that the boxes cannot reach: where a written number disagrees with how the bars add up. */
  conflicts: { measure: number; printed: number; ours: number }[];
  /** Rests whose count is pinned down by the numbers around them (the only unknown in their stretch); the others are guesses. */
  certain: Set<number>;
};

/**
 * Work out how many bars each multi-measure rest stands for, using the printed bar numbers as the checking stick.
 * Between two printed numbers the bars must add up exactly: ordinary boxes are one bar each, so one unknown rest is whatever is
 * left; digits read over a rest (`guess`) fill in the others and are checked against the total.
 * `anchors` may hold misread numbers: one that does not fit between its neighbours is dropped and reported.
 */
export function solveRests(measureCount: number, rests: RestBox[], anchors: Printed[], first = 1): Solved {
  const guess = new Map(rests.map((r) => [r.measure, r.guess]));
  const counts = new Map<number, number>();
  const conflicts: Solved['conflicts'] = [];
  const certain = new Set<number>();
  // keep anchors in reading order whose numbers keep growing (a misread digit breaks the run)
  const sorted = [...anchors].sort((a, b) => a.measure - b.measure);
  const good: Printed[] = [{ measure: 0, n: first }];
  for (const a of sorted) {
    const last = good.at(-1)!;
    if (a.measure <= last.measure) continue; // two readings for one box (or the start itself)
    const room = a.measure - last.measure; // each box is at least one bar
    if (a.n - last.n < room) { conflicts.push({ measure: a.measure, printed: a.n, ours: last.n + room }); continue; }
    good.push(a);
  }
  good.push({ measure: measureCount, n: NaN }); // the tail has no printed number to check against

  for (let k = 0; k + 1 < good.length; k++) {
    const { measure: from, n: start } = good[k], { measure: to, n: end } = good[k + 1];
    const inside = rests.filter((r) => r.measure >= from && r.measure < to);
    const known = inside.filter((r) => guess.get(r.measure) !== undefined);
    const unknown = inside.filter((r) => guess.get(r.measure) === undefined);
    for (const r of known) counts.set(r.measure, guess.get(r.measure)!);
    if (Number.isNaN(end)) { for (const r of unknown) counts.set(r.measure, 2); continue; }
    const total = end - start;
    const plain = to - from - inside.length;
    const have = known.reduce((s, r) => s + guess.get(r.measure)!, 0);
    if (unknown.length === 1) { counts.set(unknown[0].measure, Math.max(2, total - plain - have)); certain.add(unknown[0].measure); }
    else for (const r of unknown) counts.set(r.measure, 2); // shortcut: several unknown rests in one stretch are guessed as two bars each
    const ours = start + plain + inside.reduce((s, r) => s + counts.get(r.measure)!, 0);
    if (ours !== end) {
      // the written digits and the printed number disagree: the printed number wins when it fixes exactly one rest
      const fixable = inside.length === 1 ? inside : [];
      if (fixable.length) counts.set(fixable[0].measure, Math.max(2, total - plain));
      else conflicts.push({ measure: to, printed: end, ours });
    }
  }
  return { counts, conflicts, certain };
}

const isBoxed = (it: TextItem) => /^\d{1,3}$/.test(it.str.trim());

/**
 * Split the whole numbers printed above the systems into rehearsal marks (at the left edge of a box) and rest counts (centred over
 * a box). `boxOf` says which box an item sits above, with the item's position inside it as a fraction of the box width.
 */
export function numbersAbove(items: TextItem[], boxOf: (it: TextItem) => { measure: number; at: number } | undefined) {
  const marks: Printed[] = [];
  const centred: { measure: number; n: number }[] = [];
  for (const it of items) {
    if (!isBoxed(it)) continue;
    const hit = boxOf(it);
    if (!hit) continue;
    (hit.at < 0.25 ? marks : centred).push({ measure: hit.measure, n: +it.str.trim() });
  }
  return { marks, centred };
}

/** Which boxes carry a printed number, for a quick "is this bar where the score says" display. */
export const barNumberAt = (measures: Measure[], measure: number, labels: string[]) => labels[measure] ?? String(measure + 1);

/** One measure box as the planner sees it: where it is, how many bars it stands for, and the row it sits in. */
export type PlanBox = { x: number; y: number; w: number; bars: number };
export type Plan = {
  /** Boxes to fold into a neighbour (index into the input): false barlines, such as a stem that looked like one. */
  merge: number[];
  /** Boxes to cut in two: a barline that was not found. */
  split: number[];
  /** Stretches where the boxes and the printed numbers still disagree and no safe fix was found. */
  warnings: { from: number; to: number; have: number; need: number }[];
};

const median = (a: number[]) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)] ?? 0;

/**
 * Compare the boxes with the printed bar numbers and propose fixes. Between two printed numbers the bars must add up. A box
 * too many is nearly always a sliver (a stem taken for a barline): the narrowest slivers are folded into their neighbour. A box too
 * few is a missed barline: the widest ordinary boxes are cut in two. Anything else is reported, never guessed.
 * `anchors` are indices into `boxes`; the first box counts from `first`. Stretches that contain a box in `unsure` (a rest whose
 * length is only a guess) are left alone.
 */
export function planFixes(boxes: PlanBox[], anchors: Printed[], first = 1, keep: ReadonlySet<number> = new Set(), unsure: ReadonlySet<number> = new Set()): Plan {
  const plan: Plan = { merge: [], split: [], warnings: [] };
  const typical = median(boxes.filter((b) => b.bars === 1).map((b) => b.w));
  const marks = [{ measure: 0, n: first }, ...[...anchors].sort((a, b) => a.measure - b.measure).filter((a) => a.measure > 0), { measure: boxes.length, n: NaN }];
  for (let k = 0; k + 1 < marks.length; k++) {
    const { measure: from, n: start } = marks[k], { measure: to, n: end } = marks[k + 1];
    if (Number.isNaN(end) || end <= start) continue;
    if ([...unsure].some((i) => i >= from && i < to)) continue; // a guessed rest makes the sum meaningless
    const have = boxes.slice(from, to).reduce((s, b) => s + b.bars, 0);
    const need = end - start;
    if (have === need) continue;
    const idx = Array.from({ length: to - from }, (_, i) => from + i);
    if (have > need) {
      // slivers: narrow plain boxes, narrowest first. The first box of a segment is the printed one: keep it.
      const slivers = idx.filter((i) => i > from && !keep.has(i) && boxes[i].bars === 1 && boxes[i].w < typical * 0.55).sort((a, b) => boxes[a].w - boxes[b].w);
      const take = slivers.slice(0, have - need);
      plan.merge.push(...take);
      if (take.length < have - need) plan.warnings.push({ from, to, have: have - take.length, need });
    } else {
      // a missed barline: cut the box whose parts would still be widest. A box can be cut more than once (three bars under one).
      const parts = new Map<number, number>();
      let left = need - have;
      while (left > 0) {
        const best = idx.filter((i) => boxes[i].bars === 1 && !keep.has(i) && boxes[i].w / (parts.get(i) ?? 1) > typical * 1.5).sort((a, b) => boxes[b].w / (parts.get(b) ?? 1) - boxes[a].w / (parts.get(a) ?? 1))[0];
        if (best === undefined) break;
        parts.set(best, (parts.get(best) ?? 1) + 1);
        left--;
      }
      for (const [i, n] of parts) for (let k = 1; k < n; k++) plan.split.push(i);
      if (left > 0) plan.warnings.push({ from, to, have: need - left, need });
    }
  }
  return plan;
}

/** What reading a scanned page found that bears on bar numbers: the boxes that hold a thick rest bar, and the numbers printed over boxes. */
export type Signals = { rests: number[]; printed: Printed[]; /** Boxes that are all but empty: a narrow one of these is a whole-bar rest, not a false split. */ quiet?: number[] };

/**
 * Turn the printed bar numbers into suggestions: how many bars each multi-measure rest stands for, which boxes are false splits or
 * hold two bars, and where the boxes and the numbers disagree in a way no safe fix explains (a note, never applied).
 * Parts that restart the count are checked on their own.
 */
export function barChecks(measures: Measure[], signals: Signals): Suggestion[] {
  const out: Suggestion[] = [];
  type Draft = Suggestion extends infer S ? (S extends { kind: 'multirest' | 'merge' | 'split' | 'note' } ? Omit<S, 'id'> : never) : never;
  const add = (s: Draft) => out.push({ ...s, id: `check-${out.length}` } as Suggestion);
  const parts = partsOf(measures);
  const spans: [number, number][] = parts.length ? parts.map((p) => [p.start, p.end]) : [[0, measures.length - 1]];
  const isRest = new Set(signals.rests);
  for (const [a, z] of spans) {
    if (z < a) continue;
    const n = z - a + 1;
    const first = measures[a].marks?.pickup && (a === 0 || measures[a].marks?.part?.restart) ? 0 : 1;
    const anchors = signals.printed.filter((p) => p.measure >= a && p.measure <= z).map((p) => ({ measure: p.measure - a, n: p.n }));
    if (!anchors.length && !signals.rests.some((m) => m >= a && m <= z)) continue;

    // rests: those already written down keep their bars; the others are worked out from the numbers around them
    const rests: RestBox[] = [];
    for (let m = a; m <= z; m++) {
      const written = measures[m].marks?.multirest;
      if (written && written > 1) rests.push({ measure: m - a, guess: written });
      else if (isRest.has(m)) rests.push({ measure: m - a });
    }
    // A stretch with an unknown rest in it cannot be checked box by box: the rest takes up the difference. So only stretches whose
    // rests are all known are held against the numbers; a narrow box is a false split only where the count says one must be.
    const quiet = new Set(signals.quiet ?? []);
    const solved = solveRests(n, rests, anchors, first);
    for (const r of rests) {
      const bars = solved.counts.get(r.measure);
      if (r.guess === undefined && bars && bars > 1) add({ kind: 'multirest', measure: a + r.measure, bars, text: `${bars} bars of rest`, low: !solved.certain.has(r.measure) });
    }
    const boxes: PlanBox[] = measures.slice(a, z + 1).map((m, i) => ({ x: m.rect.x, y: m.rect.y, w: m.rect.w, bars: solved.counts.get(i) ?? barsIn(m) }));
    const keep = new Set(measures.slice(a, z + 1).flatMap((_, i) => (quiet.has(a + i) ? [i] : [])));
    const kept = boxes.map((_, i) => ({ i }));
    const remap = new Map(kept.map(({ i }) => [i, i]));
    const unsure = new Set(rests.filter((r) => r.guess === undefined && !solved.certain.has(r.measure)).map((r) => r.measure));
    const plan = planFixes(boxes, anchors.map((p) => ({ ...p, measure: remap.get(p.measure)! })), first, keep, unsure);
    for (const j of plan.merge) add({ kind: 'merge', measure: a + kept[j].i, text: 'a narrow box that is probably part of the bar before it', low: true });
    for (const j of plan.split) add({ kind: 'split', measure: a + kept[j].i, text: 'a wide box that probably holds two bars', low: true });
    for (const w of plan.warnings) add({ kind: 'note', measure: a + kept[w.from].i, text: `the printed numbers expect ${w.need} bars from here to box ${a + (kept[Math.min(w.to, kept.length) - 1]?.i ?? 0) + 1}, the boxes make ${w.have}: check for a missing or extra box` });
  }
  return out;
}
