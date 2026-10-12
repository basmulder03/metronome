import { describe, expect, it } from 'vitest';
import type { Marks } from '../../shared/types';
import { barHeading, barLabels, barsIn, firstBar } from './bars';

const boxes = (n: number, marks: Record<number, Marks> = {}) => Array.from({ length: n }, (_, i) => ({ marks: marks[i] }));

describe('bar numbers', () => {
  it('are just 1, 2, 3 without multi-measure rests', () => expect(barLabels(boxes(4))).toEqual(['1', '2', '3', '4']));

  it('a rest box covers several bars and the next box carries on from the printed number', () => {
    expect(barLabels(boxes(5, { 1: { multirest: 8 }, 3: { multirest: 2 } }))).toEqual(['1', '2–9', '10', '11–12', '13']);
  });

  it('a rest of 1 or nonsense counts as an ordinary bar', () => {
    expect(barsIn({ marks: { multirest: 1 } })).toBe(1);
    expect(barsIn({})).toBe(1);
    expect(barsIn({ marks: { multirest: 3.9 } })).toBe(3);
  });

  it('formats headings and picks the first bar', () => {
    expect(barHeading('5')).toBe('Measure 5');
    expect(barHeading('5–12')).toBe('Measures 5–12');
    expect(firstBar('5–12')).toBe('5');
    expect(firstBar('7')).toBe('7');
  });
});
