import { describe, expect, it } from 'vitest';
import { solveRests } from './barnumbers';

describe('solveRests', () => {
  it('one unknown rest is whatever the printed numbers leave', () => {
    // boxes 0..4, box 2 is a rest; bar 6 is printed over box 4: 1,2 then the rest 3..? then box 3, so rest = 6 - 1 - 2 - 1
    const r = solveRests(6, [{ measure: 2 }], [{ measure: 4, n: 7 }]);
    expect(r.counts.get(2)).toBe(3);
    expect(r.conflicts).toEqual([]);
  });
  it('digits read over the rest are kept when they agree', () => {
    const r = solveRests(5, [{ measure: 1, guess: 3 }], [{ measure: 3, n: 6 }]); // bar 1, rest 2-4, bar 5, then 6
    expect(r.counts.get(1)).toBe(3);
    expect(r.conflicts).toEqual([]);
  });
  it('a printed number fixes a single misread count', () => {
    const r = solveRests(5, [{ measure: 1, guess: 4 }], [{ measure: 3, n: 6 }]); // the digits say 4, the printed 6 says 3
    expect(r.counts.get(1)).toBe(3);
  });
  it('a misread printed number that cannot be reached is dropped and reported', () => {
    const r = solveRests(8, [], [{ measure: 4, n: 2 }, { measure: 6, n: 7 }]);
    expect(r.conflicts).toEqual([{ measure: 4, printed: 2, ours: 5 }]);
  });
  it('rests after the last printed number take their guess, or two', () => {
    const r = solveRests(6, [{ measure: 3, guess: 7 }, { measure: 5 }], [{ measure: 2, n: 3 }]);
    expect(r.counts.get(3)).toBe(7);
    expect(r.counts.get(5)).toBe(2);
  });
  it('a pickup that opens a piece starts the count at 0', () => {
    const r = solveRests(4, [{ measure: 1 }], [{ measure: 3, n: 6 }], 0);
    expect(r.counts.get(1)).toBe(4); // bar 0, rest 1-4, bar 5, then 6
  });
});

import { planFixes } from './barnumbers';

describe('planFixes', () => {
  const box = (w: number, bars = 1) => ({ x: 0, y: 0, w, bars });
  it('folds slivers away when there are more boxes than printed bars', () => {
    // bar 1 at box 0, bar 5 printed at box 6: six boxes for four bars, two of them slivers
    const boxes = [box(100), box(100), box(20), box(100), box(15), box(100), box(100)];
    const p = planFixes(boxes, [{ measure: 6, n: 5 }]);
    expect(p.merge.sort()).toEqual([2, 4]);
    expect(p.warnings).toEqual([]);
  });
  it('cuts the widest plain box when a barline was missed', () => {
    const boxes = [box(100), box(260), box(100), box(100)];
    const p = planFixes(boxes, [{ measure: 3, n: 5 }]);
    expect(p.split).toEqual([1]);
  });
  it('reports a surplus it cannot explain with slivers, and fixes nothing for it', () => {
    const boxes = [box(100), box(100), box(100), box(100)];
    const p = planFixes(boxes, [{ measure: 3, n: 3 }]);
    expect(p.merge).toEqual([]);
    expect(p.warnings).toEqual([{ from: 0, to: 3, have: 3, need: 2 }]);
  });
  it('counts a multi-measure rest as its bars', () => {
    const boxes = [box(100), box(100, 4), box(100), box(100)];
    expect(planFixes(boxes, [{ measure: 3, n: 7 }])).toEqual({ merge: [], split: [], warnings: [] });
  });
});

import { barChecks } from './barnumbers';
import { applySuggestions } from './readmarks';

describe('barChecks', () => {
  const m = (x: number, w: number, marks?: object) => ({ id: String(x), page: 0, rect: { x, y: 0.1, w, h: 0.05 }, ...(marks && { marks }) });
  const piece = (measures: unknown[]) => ({ ...emptyPieceLike(), measures: measures as { marks?: { multirest?: number } }[] });
  it('works out a lone rest from the numbers around it and applying writes it on the box', () => {
    const measures = [m(0.0, 0.2), m(0.2, 0.2), m(0.4, 0.2), m(0.6, 0.2)]; // bar 1 | rest | bar | printed 8 over the last box
    const s = barChecks(measures as never, { rests: [1], printed: [{ measure: 3, n: 8 }] });
    expect(s).toMatchObject([{ kind: 'multirest', measure: 1, bars: 5 }]);
    expect(s[0].low).toBeFalsy(); // the only unknown in its stretch: pinned down
    const p = piece(measures);
    expect(applySuggestions(p as never, s).applied).toBe(1);
    expect(p.measures[1].marks?.multirest).toBe(5);
  });
  it('offers to fold a sliver only where the printed number says a box too many, and unticked', () => {
    const measures = [m(0.0, 0.2), m(0.2, 0.2), m(0.4, 0.03), m(0.43, 0.2), m(0.63, 0.2)]; // printed 3 over box 3: boxes 0..2 hold only 2 bars
    const s = barChecks(measures as never, { rests: [], printed: [{ measure: 3, n: 3 }] });
    expect(s).toMatchObject([{ kind: 'merge', measure: 2, low: true }]);
    const p = piece(measures);
    expect(applySuggestions(p as never, s).applied).toBe(1);
    expect(p.measures).toHaveLength(4);
  });
  it('does not touch a stretch that holds a rest it can only guess at', () => {
    const measures = [m(0.0, 0.2), m(0.2, 0.2), m(0.4, 0.03), m(0.43, 0.2), m(0.63, 0.2), m(0.83, 0.15)];
    const s = barChecks(measures as never, { rests: [1, 4], printed: [{ measure: 5, n: 9 }] }); // two unknown rests, one number: a guess
    expect(s.filter((x) => x.kind === 'merge' || x.kind === 'split')).toEqual([]);
    expect(s.filter((x) => x.kind === 'multirest').every((x) => x.low)).toBe(true);
  });
  it('says nothing when the page had no printed numbers and no rests', () => {
    expect(barChecks([m(0, 0.2), m(0.2, 0.2)] as never, { rests: [], printed: [] })).toEqual([]);
  });
});
function emptyPieceLike() { return { measures: [], meters: [], tempos: [], ramps: [], countIn: 0 }; }
