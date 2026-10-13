import { expect, it } from 'vitest';
import { blocksOf } from './blocks';

const ms = (marks: Record<number, object>, n = 8) => Array.from({ length: n }, (_, i) => ({ marks: marks[i] as never }));

it('one repeat with two endings: a line over the section, a separate coloured line per ending, labelled once', () => {
  const b = blocksOf(ms({ 0: { repeatStart: true }, 3: { volta: [1] }, 4: { volta: [1], repeatEnd: 2 }, 5: { volta: [2] }, 6: { volta: [2] } }));
  expect(b[0].map((x) => [x.kind, x.first])).toEqual([['repeat', true]]);
  expect(b[4].map((x) => x.kind)).toEqual(['repeat', 'ending']); // the first ending is inside the repeat
  expect(b[3].find((x) => x.kind === 'ending')).toMatchObject({ first: true, last: false, label: '1.' });
  expect(b[4].find((x) => x.kind === 'ending')).toMatchObject({ first: false, last: true });
  expect(b[5]).toHaveLength(1); // the second ending is past the repeat
  expect(b[5][0]).toMatchObject({ kind: 'ending', first: true, label: '2.' });
  const colours = [b[0][0], b[3][1], b[5][0]].map((x) => x.color);
  expect(new Set(colours).size).toBe(3);
  expect(b[7]).toEqual([]);
});

it('a repeat without a start mark runs from the beginning (or after the previous repeat), with its count', () => {
  const b = blocksOf(ms({ 1: { repeatEnd: 3 }, 2: { repeatStart: true }, 3: { repeatEnd: 2 } }, 5));
  expect(b[0][0]).toMatchObject({ first: true, last: false, label: '×3' });
  expect(b[1][0]).toMatchObject({ last: true });
  expect(b[2][0]).toMatchObject({ first: true, label: '' });
  expect(b[4]).toEqual([]);
});

it('a repeat start with no end draws nothing', () => {
  expect(blocksOf(ms({ 1: { repeatStart: true } }, 4)).flat()).toEqual([]);
});
