import { describe, expect, it } from 'vitest';
import { detectMeasures, type Bitmap } from './detect';

/** White page with one system of 5 lines (spacing 8 px) and barlines at the given x. */
function page(bars: number[], W = 400, H = 300, ink = 0): Bitmap {
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  const set = (x: number, y: number) => { const i = (y * W + x) * 4; data[i] = data[i + 1] = data[i + 2] = ink; };
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

it('still finds barlines when a scan has turned the ink grey', () => {
  expect(detectMeasures(page([20, 110, 200, 290, 380], 400, 300, 165))).toHaveLength(4);
});

it('ignores stems that span one staff but not the gap between the two staves of a system', () => {
  const W = 400, H = 400;
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  const set = (x: number, y: number) => { const i = (y * W + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; };
  for (const top of [100, 180]) for (let l = 0; l < 5; l++) for (let x = 20; x <= 380; x++) set(x, top + l * 8);
  for (const bx of [20, 200, 380]) for (let y = 100; y <= 212; y++) set(bx, y); // barlines connect both staves
  for (const sx of [80, 140, 260, 320]) { for (let y = 100; y <= 132; y++) set(sx, y); for (let y = 180; y <= 212; y++) set(sx, y); } // stems: each staff, not the gap
  expect(detectMeasures({ data, width: W, height: H })).toHaveLength(2);
});

it('returns nothing for a blank page', () => {
  expect(detectMeasures({ data: new Uint8ClampedArray(100 * 100 * 4).fill(255), width: 100, height: 100 })).toEqual([]);
});

it('folds a narrow clef/key-signature header into the first measure when a heavy bar follows it', () => {
  const b = page([20, 60, 170, 280, 380]);
  for (let x = 57; x <= 63; x++) for (let y = 100; y <= 132; y++) { const i = (y * 400 + x) * 4; b.data[i] = b.data[i + 1] = b.data[i + 2] = 0; } // a heavy bar, as scores print after the header
  expect(detectMeasures(b)).toHaveLength(3);
});

it('keeps an ordinary first barline even when the first bar is short (a rest)', () => {
  expect(detectMeasures(page([20, 60, 170, 280, 380]))).toHaveLength(4);
});


// ---- shapes taken from a real, dense, slightly tilted 300 dpi scan, drawn small ----
function sheet(W = 600, H = 300) {
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  const set = (x: number, y: number) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; };
  /** five staff lines, spacing 8, from y=100, optionally tilted (rows per column) and with a gap in some lines */
  const staff = (x0: number, x1: number, tilt = 0, gap?: { from: number; to: number; lines: number[] }) => {
    for (let l = 0; l < 5; l++) for (let x = x0; x <= x1; x++) if (!(gap && gap.lines.includes(l) && x >= gap.from && x <= gap.to)) set(x, 100 + l * 8 + x * tilt);
  };
  const vline = (x: number, y0: number, y1: number, tilt = 0) => { for (let y = y0; y <= y1; y++) set(x, y + x * tilt); };
  const rect = (x0: number, y0: number, x1: number, y1: number, tilt = 0) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) set(x, y + x * tilt); };
  const notehead = (cx: number, cy: number) => { for (let dx = -5; dx <= 5; dx++) for (let dy = -3; dy <= 3; dy++) if ((dx * dx) / 25 + (dy * dy) / 9 <= 1) set(cx + dx, cy + dy); };
  return { b: { data, width: W, height: H }, staff, vline, rect, notehead };
}

describe('fast beamed music and scanned pages', () => {
  it('beamed stems with noteheads are not barlines, even when a stem is as tall as the staff', () => {
    const { b, staff, vline, rect, notehead } = sheet();
    staff(20, 380);
    for (const x of [20, 200, 380]) vline(x, 100, 132);
    for (const x of [60, 90, 120, 150]) { // four beamed notes in the first bar: stems from 100 to 132, noteheads at the foot
      vline(x, 96, 132);
      notehead(x - 5, 132);
    }
    rect(60, 94, 150, 98); // the beam
    expect(detectMeasures(b)).toHaveLength(2);
  });

  it('a stem that runs past the staff is not a barline either', () => {
    const { b, staff, vline } = sheet();
    staff(20, 380);
    for (const x of [20, 200, 380]) vline(x, 100, 132);
    vline(100, 80, 140); // a tall stem
    expect(detectMeasures(b)).toHaveLength(2);
  });

  it('a thick beam just below the staff does not stretch it, so real barlines are still found', () => {
    const { b, staff, vline, rect } = sheet();
    staff(20, 380);
    rect(20, 141, 380, 145); // a wide beam 1.6 staff spaces under the bottom line
    for (const x of [20, 200, 380]) vline(x, 100, 132);
    expect(detectMeasures(b)).toHaveLength(2);
  });

  it('a tilted scan is straightened: staff lines that drift by several rows are still one staff', () => {
    const { b, staff, vline } = sheet(600, 300);
    const tilt = 0.012; // 7 rows over the page width
    staff(20, 580, tilt);
    for (const x of [20, 200, 380, 580]) vline(x, 100, 132, tilt);
    const boxes = detectMeasures(b);
    expect(boxes).toHaveLength(3);
    // and the boxes follow the tilt: the right-hand box sits lower than the left-hand one
    expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
  });

  it('a stretch of broken staff line does not cut the system short', () => {
    const { b, staff, vline } = sheet();
    staff(20, 380, 0, { from: 230, to: 300, lines: [0, 4] }); // the outer lines are faint here
    for (const x of [20, 200, 380]) vline(x, 100, 132);
    const boxes = detectMeasures(b);
    expect(boxes).toHaveLength(2);
    expect(boxes[1].x + boxes[1].w).toBeGreaterThan(370 / 600);
  });

  it('a pretty dense row of eighths keeps its real bars', () => {
    const { b, staff, vline, notehead } = sheet();
    staff(20, 380);
    for (const x of [20, 110, 200, 290, 380]) vline(x, 100, 132);
    for (let x = 35; x < 380; x += 22) { if ([110, 200, 290].some((bx) => Math.abs(bx - x) < 12)) continue; notehead(x, 116); vline(x + 5, 90, 116); } // stems that stick out above
    expect(detectMeasures(b)).toHaveLength(4);
  });
});

it('finds a system whose lines are much shorter or fainter than the page strongest', () => {
  const W = 800, H = 500;
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  const set = (x: number, y: number) => { const i = (y * W + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; };
  for (let l = 0; l < 5; l++) for (let x = 20; x <= 780; x++) set(x, 100 + l * 8);
  for (const bx of [20, 400, 780]) for (let y = 100; y <= 132; y++) set(bx, y);
  for (let l = 0; l < 5; l++) for (let x = 20; x <= 300; x++) set(x, 300 + l * 8); // under 40% of the width: below the page-wide threshold
  for (const bx of [20, 160, 300]) for (let y = 300; y <= 332; y++) set(bx, y);
  const r = detectMeasures({ data, width: W, height: H });
  expect(r).toHaveLength(4);
  expect(r[3].y).toBeGreaterThan(r[0].y); // in reading order: the lower system comes last
});
