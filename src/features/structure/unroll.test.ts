import { describe, expect, it } from 'vitest';
import type { Marks } from '../../shared/types';
import { unroll } from './unroll';

const piece = (n: number, marks: Record<number, Marks> = {}) => Array.from({ length: n }, (_, i) => ({ marks: marks[i] }));

describe('unroll', () => {
  it('plain piece plays in order', () => expect(unroll(piece(3))).toEqual([0, 1, 2]));

  it('repeat from the start', () => expect(unroll(piece(3, { 1: { repeatEnd: 2 } }))).toEqual([0, 1, 0, 1, 2]));

  it('repeat from a start mark, three times', () =>
    expect(unroll(piece(4, { 1: { repeatStart: true }, 2: { repeatEnd: 3 } }))).toEqual([0, 1, 2, 1, 2, 1, 2, 3]));

  it('first and second endings', () => {
    const p = piece(5, { 0: { repeatStart: true }, 2: { volta: [1], repeatEnd: 2 }, 3: { volta: [2] } });
    expect(unroll(p)).toEqual([0, 1, 2, 0, 1, 3, 4]);
  });

  it('counting restarts for a later repeat after endings', () => {
    const p = piece(7, { 0: { repeatStart: true }, 1: { volta: [1], repeatEnd: 2 }, 2: { volta: [2] }, 3: { repeatStart: true }, 4: { repeatEnd: 2 } });
    expect(unroll(p)).toEqual([0, 1, 0, 2, 3, 4, 3, 4, 5, 6]);
  });

  it('D.C. al Fine', () => expect(unroll(piece(4, { 1: { fine: true }, 3: { jump: 'dc' } }))).toEqual([0, 1, 2, 3, 0, 1]));

  it('D.S. al Coda', () => {
    const p = piece(6, { 1: { segno: true }, 3: { toCoda: true, jump: 'ds' }, 5: { coda: true } });
    expect(unroll(p)).toEqual([0, 1, 2, 3, 1, 2, 3, 5]);
  });

  it('does not repeat repeats again after a D.C.', () =>
    expect(unroll(piece(3, { 0: { repeatEnd: 2 }, 2: { jump: 'dc' } }))).toEqual([0, 0, 1, 2, 0, 1, 2]));

  it('ignores a D.S. with no segno and survives bad markup', () => {
    expect(unroll(piece(2, { 1: { jump: 'ds' } }))).toEqual([0, 1]);
    expect(unroll(piece(2, { 0: { repeatEnd: 99999 } })).length).toBeLessThanOrEqual(1000);
  });
});
