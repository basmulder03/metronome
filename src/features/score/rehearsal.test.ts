import { describe, expect, it } from 'vitest';
import { findBoxedNumbers } from './rehearsal';

const page = (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255), width: w, height: h });
const ink = (b: ReturnType<typeof page>, x: number, y: number) => { const i = (y * b.width + x) * 4; b.data[i] = b.data[i + 1] = b.data[i + 2] = 0; };
const frame = (b: ReturnType<typeof page>, x: number, y: number, w: number, h: number) => {
  for (let k = 0; k <= w; k++) { ink(b, x + k, y); ink(b, x + k, y + h); }
  for (let k = 0; k <= h; k++) { ink(b, x, y + k); ink(b, x + w, y + k); }
};

describe('findBoxedNumbers', () => {
  // a box of 7 staff spaces of 10 px: staff top at y=115, so the number sits in the margin above it
  const rect = { x: 0.1, y: 100 / 400, w: 0.5, h: 70 / 400 };
  it('finds a rectangle above the system and tells which measure it is over', () => {
    const b = page(400, 400);
    frame(b, 50, 60, 30, 30);
    for (let k = 0; k < 14; k++) for (let j = 0; j < 4; j++) ink(b, 60 + j, 68 + k); // a digit's worth of ink
    expect(findBoxedNumbers(b, [rect])).toMatchObject([{ x: 50, y: 60, measure: 0 }]);
  });
  it('ignores a plain line, an open bracket and a box that is too big', () => {
    const b = page(400, 400);
    for (let k = 0; k < 30; k++) ink(b, 50 + k, 80); // a slur-like line
    for (let k = 0; k <= 30; k++) ink(b, 150, 60 + k); // an upright with nothing joined to it
    frame(b, 200, 20, 140, 60); // a title box: much larger than a rehearsal mark
    expect(findBoxedNumbers(b, [rect])).toEqual([]);
  });
});
