import { describe, expect, it } from 'vitest';
import type { Marks } from '../../shared/types';
import { defaultPartName, partIndexOf, partsOf } from './parts';

const piece = (n: number, marks: Record<number, Marks> = {}) => Array.from({ length: n }, (_, i) => ({ marks: marks[i] }));

describe('partsOf', () => {
  it('a sheet without part marks is one thing, not a list of parts', () => expect(partsOf(piece(8))).toEqual([]));

  it('each marked measure starts a part that runs to the one before the next', () => {
    const parts = partsOf(piece(10, { 0: { part: { name: 'Intro' } }, 4: { part: { name: 'Main', pause: true } }, 8: { part: { name: 'Coda' } } }));
    expect(parts).toEqual([
      { index: 0, name: 'Intro', start: 0, end: 3, pause: false },
      { index: 1, name: 'Main', start: 4, end: 7, pause: true },
      { index: 2, name: 'Coda', start: 8, end: 9, pause: false },
    ]);
  });

  it('measures before the first mark form an unnamed first part, and blank names get a number', () => {
    const parts = partsOf(piece(6, { 3: { part: { name: '  ' } } }));
    expect(parts.map((p) => [p.name, p.start, p.end])).toEqual([['Part 1', 0, 2], ['Part 2', 3, 5]]);
  });

  it('finds the part of a measure', () => {
    const parts = partsOf(piece(6, { 3: { part: { name: 'B' } } }));
    expect([0, 2, 3, 5].map((m) => partIndexOf(parts, m))).toEqual([0, 0, 1, 1]);
    expect(partIndexOf(parts, 9)).toBe(-1);
  });
});

describe('defaultPartName', () => {
  it('numbers a new part by its place among the parts, counting the unmarked first one', () => {
    expect(defaultPartName(piece(8), 0)).toBe('Part 1');
    expect(defaultPartName(piece(8), 4)).toBe('Part 2'); // measures 0-3 are an implicit Part 1
    expect(defaultPartName(piece(8, { 4: { part: { name: 'B' } } }), 6)).toBe('Part 3');
    expect(defaultPartName(piece(8, { 4: { part: { name: 'B' } } }), 2)).toBe('Part 2'); // inserted before B
  });
});
