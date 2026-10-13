import type { Marks } from '../../shared/types';
import { firstBar } from './bars';

export type Chip = { text: string; /** the jump has nowhere to go (no segno or coda marked) */ warn?: boolean };

/**
 * The jump and landmark badges of every measure, with where each jump goes, so the route through the piece can be read off the page:
 * "D.S. ↩ Segno · bar 3", "To Coda → bar 12". `bars` are the printed bar labels of the boxes.
 */
export function chipsOf(measures: { marks?: Marks }[], bars: string[]): Chip[][] {
  const at = (key: 'segno' | 'coda') => measures.findIndex((m) => m.marks?.[key]);
  const segno = at('segno'), coda = at('coda');
  const bar = (i: number) => `bar ${firstBar(bars[i] ?? String(i + 1))}`;
  return measures.map((m) => {
    const k = m.marks;
    const out: Chip[] = [];
    if (!k) return out;
    if (k.segno) out.push({ text: 'Segno' });
    if (k.coda) out.push({ text: 'Coda' });
    if (k.toCoda) out.push(coda >= 0 ? { text: `To Coda → ${bar(coda)}` } : { text: 'To Coda → no Coda marked', warn: true });
    if (k.fine) out.push({ text: 'Fine ■' });
    if (k.jump === 'dc') out.push({ text: `D.C. ↩ ${bar(0)}` });
    if (k.jump === 'ds') out.push(segno >= 0 ? { text: `D.S. ↩ Segno · ${bar(segno)}` } : { text: 'D.S. ↩ no Segno marked', warn: true });
    return out;
  });
}
