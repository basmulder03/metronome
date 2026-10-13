import type { Marks } from '../../shared/types';

/** A stretch of measures drawn as one continuous line: a repeated section, or an ending (1st, 2nd...) inside it. */
export type Block = { kind: 'repeat' | 'ending'; color: number; first: boolean; last: boolean; label: string };

export const BLOCK_COLORS = 4;

/**
 * For every measure, the blocks it belongs to. Each block gets its own colour (by order of appearance), so neighbouring
 * sections and the endings inside a repeat can be told apart; `first`/`last` say where the line starts and stops.
 */
export function blocksOf(measures: { marks?: Marks }[]): Block[][] {
  const spans: { from: number; to: number; kind: Block['kind']; label: string }[] = [];
  let start = 0;
  measures.forEach((m, i) => {
    if (m.marks?.repeatStart) start = i;
    if (m.marks?.repeatEnd) { spans.push({ from: start, to: i, kind: 'repeat', label: m.marks.repeatEnd > 2 ? `×${m.marks.repeatEnd}` : '' }); start = i + 1; }
  });
  for (let i = 0; i < measures.length; i++) {
    const v = measures[i].marks?.volta;
    if (!v) continue;
    let j = i;
    while (measures[j + 1]?.marks?.volta?.join() === v.join() && !measures[j + 1].marks?.repeatStart) j++;
    spans.push({ from: i, to: j, kind: 'ending', label: `${v.join(',')}.` });
    i = j;
  }
  spans.sort((a, b) => a.from - b.from || (a.kind === 'repeat' ? -1 : 1));
  const out: Block[][] = measures.map(() => []);
  spans.forEach((s, k) => {
    for (let i = s.from; i <= s.to; i++) out[i].push({ kind: s.kind, color: k % BLOCK_COLORS, first: i === s.from, last: i === s.to, label: s.label });
  });
  return out;
}
