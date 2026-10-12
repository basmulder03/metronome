import type { Marks, Measure } from '../../shared/types';

/** Set or clear one mark; empty values are removed so stored markup stays small. */
export function setMark<K extends keyof Marks>(m: Measure, key: K, value: Marks[K] | undefined | false) {
  const next: Marks = { ...m.marks };
  if (value === undefined || value === false || (Array.isArray(value) && !value.length)) delete next[key];
  else next[key] = value as Marks[K];
  if (Object.keys(next).length) m.marks = next; else delete m.marks;
}

/** Short text shown on the score overlay. */
export function marksLabel(k?: Marks): string {
  if (!k) return '';
  const out: string[] = [];
  if (k.part) out.push(`[${k.part.name || 'part'}${k.part.pause ? ' ⏸' : ''}]`);
  if (k.repeatStart) out.push('|:');
  if (k.volta) out.push(`${k.volta.join(',')}.`);
  if (k.segno) out.push('segno');
  if (k.coda) out.push('coda');
  if (k.repeatEnd) out.push(k.repeatEnd > 2 ? `:|×${k.repeatEnd}` : ':|');
  if (k.toCoda) out.push('to coda');
  if (k.fine) out.push('fine');
  if (k.jump) out.push(k.jump === 'dc' ? 'D.C.' : 'D.S.');
  if (k.pickup) out.push(`pickup ${k.pickup}`);
  if (k.partial) out.push(`short ${k.partial}`);
  if (k.fermata) out.push('fermata');
  return out.join(' ');
}
