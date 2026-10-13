import { meterAt, tempoAt, defaultGrouping } from '../tempo-map/timeline';
import { setMark } from '../structure/marks';
import { DEFAULT_UNIT, type Piece, type Unit } from '../../shared/types';
import { removeMeasure } from './markup';

/** Edits that apply to a run of measures `from..to` (inclusive) at once. Each leaves the music after the run as it was. */

export function setMeterOver(p: Piece, from: number, to: number, num: number, den: number) {
  const after = to + 1 < p.measures.length && !p.meters.some((e) => e.at === to + 1) ? meterAt(p, to + 1) : null;
  p.meters = p.meters.filter((e) => e.at < from || e.at > to);
  p.meters.push({ at: from, meter: { num, den, grouping: defaultGrouping(num, den) } });
  if (after && (after.num !== num || after.den !== den)) p.meters.push({ at: to + 1, meter: { ...after, grouping: [...after.grouping] } });
  p.meters.sort((a, b) => a.at - b.at);
}

export function setTempoOver(p: Piece, from: number, to: number, bpm: number, unit?: Unit) {
  const now = tempoAt(p, from);
  const after = to + 1 < p.measures.length && !p.tempos.some((e) => e.at === to + 1) ? tempoAt(p, to + 1) : null;
  p.tempos = p.tempos.filter((e) => e.at < from || e.at > to);
  p.tempos.push({ at: from, bpm, unit: unit ?? { ...(now?.unit ?? DEFAULT_UNIT) } });
  if (after) p.tempos.push({ at: to + 1, bpm: after.bpm, unit: { ...after.unit } });
  p.tempos.sort((a, b) => a.at - b.at);
}

const JUMPS = ['repeatStart', 'repeatEnd', 'volta', 'segno', 'coda', 'fine', 'toCoda', 'jump'] as const;

/** Drop every repeat, ending and jump mark in the run. */
export function clearRepeatsOver(p: Piece, from: number, to: number) {
  for (let i = from; i <= to; i++) for (const k of JUMPS) setMark(p.measures[i], k, undefined);
}

/** One ending bracket over the whole run (`undefined` removes it). */
export function setEndingOver(p: Piece, from: number, to: number, passes?: number[]) {
  for (let i = from; i <= to; i++) setMark(p.measures[i], 'volta', passes);
}

export function removeRange(p: Piece, from: number, to: number) {
  for (let i = to; i >= from; i--) removeMeasure(p, i);
}
