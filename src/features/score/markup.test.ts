import { describe, expect, it } from 'vitest';
import { dragEdge, looksLikePickup, mergeMeasures, moveBox, removeMeasure, replaceBoxes, splitMeasure } from './markup';
import { emptyPiece, type Piece } from '../../shared/types';

const piece = (n: number): Piece => {
  const p = emptyPiece();
  for (let i = 0; i < n; i++) p.measures.push({ id: `m${i}`, page: 0, rect: { x: i / n, y: 0, w: 1 / n, h: 0.1 } });
  return p;
};
const q = { den: 4, dotted: false };

describe('markup edits', () => {
  it('split keeps later events attached to the same music', () => {
    const p = piece(3);
    p.tempos.push({ at: 2, bpm: 80, unit: q });
    p.ramps.push({ from: 0, to: 1, startBpm: 60, endBpm: 90, curve: [0, 0, 1, 1] });
    expect(splitMeasure(p, 0, 0.1, 'new')).toBe(true);
    expect(p.measures).toHaveLength(4);
    expect(p.tempos[0].at).toBe(3);
    expect(p.ramps[0]).toMatchObject({ from: 0, to: 2 });
  });
  
  it('remove undoes the shift', () => {
    const p = piece(4);
    p.tempos.push({ at: 3, bpm: 80, unit: q });
    removeMeasure(p, 1);
    expect(p.tempos[0].at).toBe(2);
  });
});

it('split moves end-of-measure marks to the right half', () => {
  const p = piece(2);
  p.measures[0].marks = { repeatStart: true, repeatEnd: 2, volta: [1] };
  expect(splitMeasure(p, 0, 0.1, 'new')).toBe(true);
  expect(p.measures[0].marks).toEqual({ repeatStart: true, volta: [1] });
  expect(p.measures[1].marks).toEqual({ repeatEnd: 2, volta: [1] });
});

describe('replaceBoxes', () => {
  const rects = (n: number, y = 0.2) => Array.from({ length: n }, (_, i) => ({ x: 0.1 + i * 0.2, y, w: 0.2, h: 0.1 }));

  it('keeps tempos, meters and marks when the boxes are redrawn, and only reshapes the boxes', () => {
    const p = piece(4);
    p.tempos.push({ at: 2, bpm: 90, unit: q });
    p.meters.push({ at: 1, meter: { num: 7, den: 8, grouping: [2, 2, 3] } });
    p.measures[3].marks = { repeatEnd: 2 };
    const ids = p.measures.map((m) => m.id);
    expect(replaceBoxes(p, 0, rects(4))).toEqual({ kept: 4, added: 0, removed: 0 });
    expect(p.measures.map((m) => m.id)).toEqual(ids);
    expect(p.measures[1].rect.x).toBeCloseTo(0.3);
    expect(p.tempos[0].at).toBe(2);
    expect(p.measures[3].marks).toEqual({ repeatEnd: 2 });
  });

  it('adds boxes after the page\'s last one and keeps later pages and their events attached', () => {
    const p = piece(3);
    p.measures.push({ id: 'p1', page: 1, rect: { x: 0, y: 0, w: 0.5, h: 0.1 } });
    p.tempos.push({ at: 3, bpm: 70, unit: q }); // on the first box of page 1
    replaceBoxes(p, 0, rects(5));
    expect(p.measures.map((m) => m.page)).toEqual([0, 0, 0, 0, 0, 1]);
    expect(p.tempos[0].at).toBe(5); // still on the page-1 box
  });

  it('removes leftover boxes from the end and drops only their events', () => {
    const p = piece(4);
    p.tempos.push({ at: 0, bpm: 100, unit: q }, { at: 3, bpm: 60, unit: q });
    expect(replaceBoxes(p, 0, rects(2))).toEqual({ kept: 2, added: 0, removed: 2 });
    expect(p.measures).toHaveLength(2);
    expect(p.tempos).toEqual([{ at: 0, bpm: 100, unit: q }]);
  });

  it('fills a page that had no boxes in the right place', () => {
    const p = piece(2);
    p.measures.push({ id: 'p2', page: 2, rect: { x: 0, y: 0, w: 0.5, h: 0.1 } });
    replaceBoxes(p, 1, rects(2));
    expect(p.measures.map((m) => m.page)).toEqual([0, 0, 1, 1, 2]);
  });
});

describe('mergeMeasures', () => {
  it('joins two boxes into one and keeps the end-of-measure marks of the second', () => {
    const p = piece(3);
    p.measures[0].marks = { repeatStart: true };
    p.measures[1].marks = { repeatEnd: 2, fermata: { beat: 0, factor: 2 } };
    p.tempos.push({ at: 1, bpm: 80, unit: q }, { at: 2, bpm: 60, unit: q });
    expect(mergeMeasures(p, 0)).toBe(true);
    expect(p.measures).toHaveLength(2);
    expect(p.measures[0].rect.x).toBeCloseTo(0);
    expect(p.measures[0].rect.w).toBeCloseTo(2 / 3);
    expect(p.measures[0].marks).toEqual({ repeatStart: true, repeatEnd: 2 });
    expect(p.tempos).toEqual([{ at: 1, bpm: 60, unit: q }]); // the event on the removed box is gone, the later one shifted
  });

  it('refuses to merge across pages or past the end', () => {
    const p = piece(2);
    p.measures[1].page = 1;
    expect(mergeMeasures(p, 0)).toBe(false);
    expect(mergeMeasures(p, 1)).toBe(false);
  });
});

describe('dragEdge and moveBox', () => {
  const adjacent = () => { const p = piece(2); p.measures[0].rect = { x: 0.1, y: 0.2, w: 0.3, h: 0.1 }; p.measures[1].rect = { x: 0.4, y: 0.2, w: 0.3, h: 0.1 }; return p; };

  it('dragging a shared barline resizes both neighbours and keeps them touching', () => {
    const p = adjacent();
    dragEdge(p, 0, 'right', 0.05);
    expect(p.measures[0].rect.w).toBeCloseTo(0.35);
    expect(p.measures[1].rect.x).toBeCloseTo(0.45);
    expect(p.measures[1].rect.w).toBeCloseTo(0.25);
    dragEdge(p, 1, 'left', -0.1);
    expect(p.measures[0].rect.w).toBeCloseTo(0.25);
    expect(p.measures[1].rect.x).toBeCloseTo(0.35);
  });

  it('an edge with no neighbour only moves that box', () => {
    const p = adjacent();
    dragEdge(p, 1, 'right', 0.1);
    expect(p.measures[1].rect.w).toBeCloseTo(0.4);
    expect(p.measures[0].rect.w).toBeCloseTo(0.3);
    p.measures[1].rect.y = 0.6; // a different system: not the same barline any more
    dragEdge(p, 0, 'right', 0.05);
    expect(p.measures[1].rect.x).toBeCloseTo(0.4);
  });

  it('boxes keep a minimum size and stay on the page', () => {
    const p = adjacent();
    dragEdge(p, 0, 'right', -5);
    expect(p.measures[0].rect.w).toBeCloseTo(0.004);
    expect(p.measures[1].rect.x).toBeCloseTo(0.104); // the neighbour grew by exactly what the first lost
    const q2 = adjacent();
    dragEdge(q2, 1, 'right', 5);
    expect(q2.measures[1].rect.x + q2.measures[1].rect.w).toBeLessThanOrEqual(1.0000001);
    dragEdge(q2, 0, 'top', 5);
    expect(q2.measures[0].rect.h).toBeCloseTo(0.004, 6);
    dragEdge(q2, 0, 'bottom', 5);
    expect(q2.measures[0].rect.y + q2.measures[0].rect.h).toBeLessThanOrEqual(1.0000001);
  });

  it('moveBox keeps the box inside the page', () => {
    const p = adjacent();
    moveBox(p, 0, -5, 5);
    expect(p.measures[0].rect.x).toBe(0);
    expect(p.measures[0].rect.y).toBeCloseTo(0.9);
  });
});

describe('short bars and upbeats while editing boxes', () => {
  it('splitting keeps an upbeat on the left and sends "ends early" to the right half', () => {
    const p = piece(1);
    p.measures[0].marks = { pickup: 1, partial: 3 };
    splitMeasure(p, 0, 0.5, 'n');
    expect(p.measures[0].marks).toEqual({ pickup: 1 });
    expect(p.measures[1].marks).toEqual({ partial: 3 });
  });

  it('merging takes the upbeat from the first box and the early end from the second', () => {
    const p = piece(2);
    p.measures[0].marks = { pickup: 1 };
    p.measures[1].marks = { partial: 3 };
    mergeMeasures(p, 0);
    expect(p.measures[0].marks).toEqual({ pickup: 1, partial: 3 });
  });
});

describe('looksLikePickup', () => {
  const row = (widths: number[]) => {
    const p = emptyPiece();
    let x = 0.1;
    widths.forEach((w, i) => { p.measures.push({ id: `${i}`, page: 0, rect: { x, y: 0.2, w, h: 0.1 } }); x += w; });
    return p;
  };
  it('flags a first box much narrower than the others', () => expect(looksLikePickup(row([0.06, 0.2, 0.21, 0.2]))).toBe(true));
  it('does not flag a normal first box, a short system or one already marked', () => {
    expect(looksLikePickup(row([0.2, 0.2, 0.21, 0.2]))).toBe(false);
    expect(looksLikePickup(row([0.06, 0.2]))).toBe(false);
    const p = row([0.06, 0.2, 0.21, 0.2]);
    p.measures[0].marks = { pickup: 1 };
    expect(looksLikePickup(p)).toBe(false);
  });
});
