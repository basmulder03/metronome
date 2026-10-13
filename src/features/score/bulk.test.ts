import { describe, expect, it } from 'vitest';
import { clearRepeatsOver, removeRange, setEndingOver, setMeterOver, setTempoOver } from './bulk';
import { emptyPiece, type Piece } from '../../shared/types';

const piece = (n: number): Piece => {
  const p = emptyPiece();
  for (let i = 0; i < n; i++) p.measures.push({ id: `m${i}`, page: 0, rect: { x: i / n, y: 0, w: 1 / n, h: 0.1 } });
  return p;
};
const q = { den: 4, dotted: false };

describe('bulk edits', () => {
  it('a meter over a run replaces events inside it and restores the one after it', () => {
    const p = piece(8);
    p.meters.push({ at: 0, meter: { num: 4, den: 4, grouping: [1, 1, 1, 1] } }, { at: 3, meter: { num: 2, den: 4, grouping: [1, 1] } });
    setMeterOver(p, 2, 5, 3, 4);
    expect(p.meters.map((e) => [e.at, e.meter.num])).toEqual([[0, 4], [2, 3], [6, 2]]); // 2/4 (set at bar 4) was in force at bar 7, so it resumes there
  });

  it('adds no restoring event when the run reaches the end, or the next meter is the same', () => {
    const p = piece(4);
    setMeterOver(p, 1, 3, 3, 4);
    expect(p.meters).toHaveLength(1);
    const r = piece(4);
    setMeterOver(r, 0, 1, 4, 4);
    expect(r.meters).toHaveLength(1);
  });

  it('a tempo over a run keeps the unit in force and the tempo after the run', () => {
    const p = piece(6);
    p.tempos.push({ at: 0, bpm: 100, unit: { den: 8, dotted: true } }, { at: 4, bpm: 60, unit: q });
    setTempoOver(p, 1, 3, 120);
    expect(p.tempos).toEqual([
      { at: 0, bpm: 100, unit: { den: 8, dotted: true } },
      { at: 1, bpm: 120, unit: { den: 8, dotted: true } },
      { at: 4, bpm: 60, unit: q },
    ]);
  });

  it('after a run that ends where a tempo already starts, nothing is added', () => {
    const p = piece(6);
    p.tempos.push({ at: 4, bpm: 60, unit: q });
    setTempoOver(p, 1, 3, 90);
    expect(p.tempos.map((e) => [e.at, e.bpm])).toEqual([[1, 90], [4, 60]]);
  });

  it('endings, clearing marks and deleting a run', () => {
    const p = piece(6);
    p.measures[0].marks = { repeatStart: true, pickup: 1 };
    p.measures[2].marks = { repeatEnd: 2, segno: true, jump: 'dc' };
    setEndingOver(p, 3, 4, [1]);
    expect(p.measures[3].marks).toEqual({ volta: [1] });
    clearRepeatsOver(p, 0, 4);
    expect(p.measures[0].marks).toEqual({ pickup: 1 });
    expect(p.measures[2].marks).toBeUndefined();
    expect(p.measures[3].marks).toBeUndefined();
    p.tempos.push({ at: 5, bpm: 80, unit: q });
    removeRange(p, 1, 3);
    expect(p.measures).toHaveLength(3);
    expect(p.tempos[0].at).toBe(2);
  });
});
