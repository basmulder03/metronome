import { describe, expect, it } from 'vitest';
import { removeMeasure, splitMeasure } from './markup';
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
