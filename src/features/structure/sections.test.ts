import { expect, it } from 'vitest';
import { removeMeasure } from '../score/markup';
import { emptyPiece } from '../../shared/types';
import { addSection, removeSection, sectionRange } from './sections';

const piece = () => {
  const p = emptyPiece();
  for (let i = 0; i < 6; i++) p.measures.push({ id: `m${i}`, page: 0, rect: { x: i / 6, y: 0, w: 1 / 6, h: 0.1 } });
  return p;
};

it('a section follows its boxes when others are inserted or removed, and is gone with them', () => {
  const p = piece();
  addSection(p, '  Hard run ', 2, 4);
  expect(sectionRange(p, p.sections![0])).toEqual([2, 4]);
  expect(p.sections![0].name).toBe('Hard run');
  removeMeasure(p, 0);
  expect(sectionRange(p, p.sections![0])).toEqual([1, 3]); // everything moved up one
  removeMeasure(p, 3); // its last box
  expect(sectionRange(p, p.sections![0])).toBeNull();
});

it('rejects an empty name and removes cleanly', () => {
  const p = piece();
  addSection(p, '   ', 0, 1);
  expect(p.sections).toBeUndefined();
  addSection(p, 'A', 0, 1);
  removeSection(p, 0);
  expect(p.sections).toBeUndefined();
});
