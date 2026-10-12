import { expect, it } from 'vitest';
import { move } from './playlist.svelte';

const mk = () => ({ id: 'p', name: 'n', gap: 4, items: ['a', 'b', 'c'] });

it('move swaps neighbours and ignores the ends', () => {
  const p = mk();
  move(p, 2, -1);
  expect(p.items).toEqual(['a', 'c', 'b']);
  move(p, 0, -1);
  move(p, 2, 1);
  expect(p.items).toEqual(['a', 'c', 'b']);
});
