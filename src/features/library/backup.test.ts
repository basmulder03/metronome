import { describe, expect, it } from 'vitest';
import { emptyPiece } from '../../shared/types';
import { exportBackup, parseBackup } from './backup';

const piece = () => ({ ...emptyPiece(), measures: [{ id: 'x', page: 0, rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 }, marks: { part: { name: 'I', restart: true } } }], tempos: [{ at: 0, bpm: 72, unit: { den: 4, dotted: false } }] });

describe('backup', () => {
  it('round-trips markup, with fresh ids and without any PDF', () => {
    const back = parseBackup(exportBackup([{ title: 'Lord', piece: piece() }, { title: 'empty', piece: emptyPiece() }]))!;
    expect(back).toHaveLength(1); // an empty piece has nothing to move
    expect(back[0].title).toBe('Lord');
    expect(back[0].piece.tempos[0].bpm).toBe(72);
    expect(back[0].piece.measures[0].marks?.part).toEqual({ name: 'I', restart: true });
    expect(back[0].piece.measures[0].id).not.toBe('x');
  });
  it('rejects things that are not a backup', () => {
    expect(parseBackup('nope')).toBeNull();
    expect(parseBackup('{"app":"other","v":1,"pieces":[]}')).toBeNull();
  });
});
