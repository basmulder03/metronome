import { describe, expect, it } from 'vitest';
import { suggestRepeats } from './repeats';
import { applySuggestions } from './readmarks';
import { emptyPiece, type Measure } from '../../shared/types';
import type { Bitmap } from './detect';

// A synthetic page: a white canvas with a five-line staff and the pieces of repeat signs drawn in by hand.
const W = 700, H = 120, SP = 10, TOP = 40;
function page(draw: (rect: (x: number, y: number, w: number, h: number) => void) => void): Bitmap {
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  const rect = (x: number, y: number, w: number, h: number) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { const k = (j * W + i) * 4; data[k] = data[k + 1] = data[k + 2] = 0; } };
  for (let l = 0; l < 5; l++) rect(0, TOP + l * SP, W, 1); // staff lines
  draw(rect);
  return { data, width: W, height: H };
}
const dots = (rect: (x: number, y: number, w: number, h: number) => void, x: number) => { rect(x, TOP + 13, 4, 4); rect(x, TOP + 23, 4, 4); }; // the 2nd and 3rd spaces
const bar = (rect: (x: number, y: number, w: number, h: number) => void, x: number, w: number) => rect(x, TOP, w, 4 * SP + 1);
const box = (x0: number, x1: number): Measure => ({ id: `${x0}`, page: 0, rect: { x: x0 / W, y: 20 / H, w: (x1 - x0) / W, h: 80 / H } });

describe('reading repeat signs from the page', () => {
  it('finds a repeat that ends a box and one that starts the next, and nothing in plain bars', () => {
    const b = page((r) => {
      bar(r, 150, 1); // an ordinary barline between boxes 0 and 1
      dots(r, 296); bar(r, 303, 2); bar(r, 309, 5); // :|  closes box 1 (dots, thin, thick)
      bar(r, 311, 5); // thick | thin | dots: opens box 2
      bar(r, 319, 2); dots(r, 326);
    });
    const ms = [box(0, 150), box(150, 312), box(312, 600)];
    const s = suggestRepeats(ms, new Map([[0, b]]));
    expect(s.map((x) => [x.kind === 'repeat' && x.side, x.measure])).toEqual([['end', 1], ['start', 2]]);
  });

  it('a double repeat (:|:) closes one box and opens the next', () => {
    const b = page((r) => { dots(r, 290); bar(r, 297, 2); bar(r, 303, 5); bar(r, 311, 2); dots(r, 318); });
    const s = suggestRepeats([box(0, 306), box(306, 600)], new Map([[0, b]]));
    expect(s.map((x) => [x.kind === 'repeat' && x.side, x.measure])).toEqual([['end', 0], ['start', 1]]);
  });

  it('a repeat after the clef of the first box in a row is found inside the box', () => {
    const b = page((r) => { bar(r, 0, 2); bar(r, 70, 5); bar(r, 78, 2); dots(r, 86); });
    const s = suggestRepeats([box(0, 400)], new Map([[0, b]]));
    expect(s.map((x) => [x.kind === 'repeat' && x.side, x.measure])).toEqual([['start', 0]]);
  });

  it('a thick double barline without dots is not a repeat, nor are dots without bars', () => {
    const b = page((r) => { bar(r, 200, 5); bar(r, 208, 2); dots(r, 400); });
    expect(suggestRepeats([box(0, 212), box(212, 600)], new Map([[0, b]]))).toEqual([]);
  });

  it('skips what the box already has, and applying sets the marks', () => {
    const b = page((r) => { dots(r, 290); bar(r, 297, 2); bar(r, 303, 5); });
    const ms = [box(0, 308)];
    ms[0].marks = { repeatEnd: 3 };
    expect(suggestRepeats(ms, new Map([[0, b]]))).toEqual([]);
    delete ms[0].marks;
    const p = { ...emptyPiece(), measures: ms };
    const s = suggestRepeats(ms, new Map([[0, b]]));
    expect(applySuggestions(p, s)).toEqual({ applied: 1, skipped: 0 });
    expect(p.measures[0].marks).toEqual({ repeatEnd: 2 });
  });
});
