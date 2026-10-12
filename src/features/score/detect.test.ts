import { expect, it } from 'vitest';
import { detectMeasures, type Bitmap } from './detect';

/** White page with one system of 5 lines (spacing 8 px) and barlines at the given x. */
function page(bars: number[], W = 400, H = 300): Bitmap {
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  const set = (x: number, y: number) => { const i = (y * W + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; };
  for (let l = 0; l < 5; l++) for (let x = 20; x <= 380; x++) set(x, 100 + l * 8);
  for (const bx of bars) for (let y = 100; y <= 132; y++) set(bx, y);
  return { data, width: W, height: H };
}

it('finds 4 measures between 5 barlines', () => {
  const r = detectMeasures(page([20, 110, 200, 290, 380]));
  expect(r).toHaveLength(4);
  expect(r[0].x * 400).toBeCloseTo(20, 0);
  expect(r[3].x * 400 + r[3].w * 400).toBeCloseTo(380, 0);
});

it('merges a double barline into one boundary', () => {
  expect(detectMeasures(page([20, 200, 205, 380]))).toHaveLength(2);
});

it('returns nothing for a blank page', () => {
  expect(detectMeasures({ data: new Uint8ClampedArray(100 * 100 * 4).fill(255), width: 100, height: 100 })).toEqual([]);
});

it('folds a narrow clef/key-signature header into the first measure', () => {
  // header 20..60 (40 px) then measures of ~107 px
  expect(detectMeasures(page([20, 60, 170, 280, 380]))).toHaveLength(3);
});
