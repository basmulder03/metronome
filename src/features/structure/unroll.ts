import type { Marks } from '../../shared/types';

/**
 * Playing order (measure indices) from repeat and jump marks.
 * Rules: after a D.C./D.S. is taken, repeats are not repeated again, Fine ends the piece and "to Coda" jumps to the coda.
 * shortcut: a jump with no matching segno/coda is ignored; the sequence is capped so bad markup cannot loop forever.
 */
export function unroll(measures: { marks?: Marks }[]): number[] {
  const n = measures.length;
  const mk = (i: number): Marks => measures[i].marks ?? {};
  const segno = measures.findIndex((m) => m.marks?.segno);
  const coda = measures.findIndex((m) => m.marks?.coda);
  const startOf = (end: number) => {
    for (let k = end; k >= 0; k--) if (mk(k).repeatStart) return k;
    return 0;
  };

  const seq: number[] = [];
  const limit = Math.max(1000, n * 50);
  let i = 0, pass = 1, jumped = false, inEnding = false;
  while (i < n && seq.length < limit) {
    const m = mk(i);
    if (m.volta) {
      inEnding = true;
      if (!m.volta.includes(jumped ? 1 : pass)) { i++; continue; }
    } else if (inEnding) {
      inEnding = false;
      pass = 1; // left the endings: the next repeat starts counting afresh
    }
    seq.push(i);
    if (jumped && m.fine) break;
    if (jumped && m.toCoda && coda >= 0) { i = coda; continue; }
    if (!jumped && m.repeatEnd) {
      if (pass < m.repeatEnd) { pass++; inEnding = false; i = startOf(i); continue; } // jumping back is not "leaving the endings"
      pass = 1;
    }
    if (!jumped && m.jump) {
      const to = m.jump === 'dc' ? 0 : segno;
      if (to >= 0) { jumped = true; pass = 1; inEnding = false; i = to; continue; }
    }
    i++;
  }
  return seq;
}
