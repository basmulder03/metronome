import { expect, it } from 'vitest';
import { chipsOf } from './jumps';

const ms = (marks: Record<number, object>, n = 6) => Array.from({ length: n }, (_, i) => ({ marks: marks[i] as never }));
const bars = ['1', '2', '3', '4', '5', '6'];

it('says where each jump goes', () => {
  const c = chipsOf(ms({ 1: { segno: true }, 3: { toCoda: true }, 4: { coda: true }, 5: { jump: 'ds', fine: true } }), bars);
  expect(c[1].map((x) => x.text)).toEqual(['Segno']);
  expect(c[3].map((x) => x.text)).toEqual(['To Coda → bar 5']);
  expect(c[5].map((x) => x.text)).toEqual(['Fine ■', 'D.S. ↩ Segno · bar 2']);
  expect(chipsOf(ms({ 5: { jump: 'dc' } }), bars)[5][0].text).toBe('D.C. ↩ bar 1');
});

it('flags a jump with nowhere to go', () => {
  const c = chipsOf(ms({ 2: { jump: 'ds', toCoda: true } }), bars);
  expect(c[2].map((x) => x.warn)).toEqual([true, true]);
});
