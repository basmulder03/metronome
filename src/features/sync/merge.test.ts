import { describe, expect, it } from 'vitest';
import { mergePieces, pick } from './merge';
import { emptyPiece, type Piece } from '../../shared/types';

const q = { den: 4, dotted: false };
const piece = (ids: string[]): Piece => {
  const p = emptyPiece();
  ids.forEach((id, i) => p.measures.push({ id, page: 0, rect: { x: i / 10, y: 0, w: 0.1, h: 0.1 } }));
  return p;
};
const clone = (p: Piece): Piece => structuredClone(p);
const ids = (p: Piece) => p.measures.map((m) => m.id);

describe('pick', () => {
  it('takes the one change, the common change, or the newer of two', () => {
    expect(pick(1, 1, 2, false)).toBe(2);
    expect(pick(1, 2, 1, true)).toBe(2);
    expect(pick(1, 2, 2, true)).toBe(2);
    expect(pick(1, 2, 3, true)).toBe(3);
    expect(pick(1, 2, 3, false)).toBe(2);
    expect(pick(1, 1, undefined, false)).toBeUndefined(); // a removal is a change
    expect(pick(undefined, 5, undefined, true)).toBe(5);
  });
});

describe('mergePieces', () => {
  it('is a no-op when nothing diverged, and takes the other side when only one changed', () => {
    const b = piece(['a', 'b', 'c']);
    b.tempos.push({ at: 1, bpm: 90, unit: q });
    const o = clone(b), t = clone(b);
    t.tempos[0].bpm = 100;
    expect(mergePieces(b, b, b, false)).toEqual(b);
    expect(mergePieces(b, o, t, true)).toEqual(t); // only they changed
    expect(mergePieces(b, t, o, true)).toEqual(t); // only we changed
  });

  it('edits to different things are both kept, even when boxes were added before them', () => {
    const b = piece(['a', 'b', 'c', 'd']);
    const ours = clone(b), theirs = clone(b);
    ours.measures.splice(0, 0, { id: 'new', page: 0, rect: { x: 0, y: 0.5, w: 0.1, h: 0.1 } }); // we add a box in front: every position shifts
    ours.tempos.push({ at: 4, bpm: 120, unit: q }); // and set a tempo on d (now at 4)
    theirs.meters.push({ at: 2, meter: { num: 3, den: 4, grouping: [1, 1, 1] } }); // they set 3/4 on c (at 2 on their side)
    theirs.measures[1].marks = { fermata: { beat: 0, factor: 2 } };
    const m = mergePieces(b, ours, theirs, true);
    expect(ids(m)).toEqual(['new', 'a', 'b', 'c', 'd']);
    expect(m.tempos).toEqual([{ at: 4, bpm: 120, unit: q }]); // still on d
    expect(m.meters.map((e) => [e.at, e.meter.num])).toEqual([[3, 3]]); // still on c, which moved to 3
    expect(m.measures[2].marks).toEqual({ fermata: { beat: 0, factor: 2 } }); // b
  });

  it('boxes added on both sides all stay, in a sensible order', () => {
    const b = piece(['a', 'b']);
    const ours = clone(b), theirs = clone(b);
    ours.measures.splice(1, 0, { id: 'o1', page: 0, rect: { x: 0, y: 0, w: 0.1, h: 0.1 } });
    theirs.measures.splice(1, 0, { id: 't1', page: 0, rect: { x: 0, y: 0, w: 0.1, h: 0.1 } });
    theirs.measures.push({ id: 't2', page: 0, rect: { x: 0, y: 0, w: 0.1, h: 0.1 } });
    const m = mergePieces(b, ours, theirs, false);
    expect(ids(m)).toEqual(['a', 't1', 'o1', 'b', 't2']);
    expect(new Set(ids(m)).size).toBe(5);
  });

  it('a box removed on either side is removed, with its tempo, and ramps and positions close up', () => {
    const b = piece(['a', 'b', 'c', 'd']);
    b.tempos.push({ at: 1, bpm: 90, unit: q }, { at: 3, bpm: 70, unit: q });
    b.ramps.push({ from: 2, to: 3, startBpm: 90, endBpm: 70, curve: [0.4, 0, 0.6, 1] });
    const ours = clone(b), theirs = clone(b);
    ours.measures.splice(1, 1); ours.tempos = [{ at: 2, bpm: 70, unit: q }]; ours.ramps[0] = { ...ours.ramps[0], from: 1, to: 2 };
    theirs.measures[1].marks = { repeatStart: true }; // they edited the box we removed: the removal wins
    theirs.measures[2].marks = { fermata: { beat: 1, factor: 3 } };
    const m = mergePieces(b, ours, theirs, true);
    expect(ids(m)).toEqual(['a', 'c', 'd']);
    expect(m.tempos).toEqual([{ at: 2, bpm: 70, unit: q }]);
    expect(m.ramps).toEqual([{ from: 1, to: 2, startBpm: 90, endBpm: 70, curve: [0.4, 0, 0.6, 1] }]);
    expect(m.measures[1].marks).toEqual({ fermata: { beat: 1, factor: 3 } });
  });

  it('marks merge one by one, and the same mark changed twice goes to the newer save', () => {
    const b = piece(['a', 'b']);
    b.measures[0].marks = { repeatEnd: 2 };
    const ours = clone(b), theirs = clone(b);
    ours.measures[0].marks = { repeatEnd: 3, fermata: { beat: 0, factor: 2 } };
    theirs.measures[0].marks = { repeatEnd: 4, segno: true };
    expect(mergePieces(b, ours, theirs, true).measures[0].marks).toEqual({ repeatEnd: 4, fermata: { beat: 0, factor: 2 }, segno: true });
    expect(mergePieces(b, ours, theirs, false).measures[0].marks).toEqual({ repeatEnd: 3, fermata: { beat: 0, factor: 2 }, segno: true });
  });

  it('the same tempo changed on both sides: the newer one; a removed tempo stays removed', () => {
    const b = piece(['a', 'b', 'c']);
    b.tempos.push({ at: 0, bpm: 100, unit: q }, { at: 2, bpm: 80, unit: q });
    const ours = clone(b), theirs = clone(b);
    ours.tempos[0].bpm = 110; theirs.tempos[0].bpm = 120;
    ours.tempos.pop(); // we remove the tempo on c
    const m = mergePieces(b, ours, theirs, true);
    expect(m.tempos).toEqual([{ at: 0, bpm: 120, unit: q }]);
  });

  it('count-in, sections: one side adds, the other removes, both stay sensible', () => {
    const b = piece(['a', 'b', 'c']);
    b.sections = [{ name: 'old', from: 'a', to: 'b' }];
    const ours = clone(b), theirs = clone(b);
    ours.countIn = 2;
    ours.sections = [...ours.sections!, { name: 'mine', from: 'b', to: 'c' }];
    theirs.sections = []; // they deleted "old"
    delete theirs.sections;
    theirs.afterPart = 'stop';
    const m = mergePieces(b, ours, theirs, true);
    expect(m.countIn).toBe(2);
    expect(m.afterPart).toBe('stop');
    expect(m.sections!.map((s) => s.name)).toEqual(['mine']);
  });

  it('is symmetric in what survives (only ties differ) and never mutates its inputs', () => {
    const b = piece(['a', 'b', 'c']);
    b.tempos.push({ at: 1, bpm: 90, unit: q });
    const ours = clone(b), theirs = clone(b);
    ours.measures.push({ id: 'o', page: 0, rect: { x: 0.9, y: 0, w: 0.1, h: 0.1 } });
    theirs.measures.splice(0, 1);
    theirs.tempos[0].at = 0; // removing a box moves the events behind it up, as the editor does
    theirs.meters.push({ at: 1, meter: { num: 5, den: 4, grouping: [2, 3] } });
    const snap = JSON.stringify([b, ours, theirs]);
    const m1 = mergePieces(b, ours, theirs, true), m2 = mergePieces(b, theirs, ours, false);
    expect(JSON.stringify([b, ours, theirs])).toBe(snap);
    expect(new Set(ids(m1))).toEqual(new Set(ids(m2)));
    expect(ids(m1)).toEqual(['b', 'c', 'o']);
    expect(m1.tempos).toEqual([{ at: 0, bpm: 90, unit: q }]); // the tempo was on b, which moved up
    expect(m1.meters[0]).toMatchObject({ at: 1, meter: { num: 5 } }); // on c
  });
});
