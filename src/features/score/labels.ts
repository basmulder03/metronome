import type { Piece } from '../../shared/types';
import { marksLabel } from '../structure/marks';

const glyph = (den: number, dotted: boolean) => (dotted ? '♩.' : den === 4 ? '♩' : den === 8 ? '♪' : '𝅗𝅥');

/** Short text for a measure on the score or in the measure grid: meter, tempo, accel/rall, repeat marks. */
/** `rests: false` leaves multi-measure rests out: they depend on the player's part. */
export function boxLabel(p: Piece, i: number, rests = true): string {
  const out: string[] = [];
  const mt = p.meters.find((e) => e.at === i);
  const tp = p.tempos.find((e) => e.at === i);
  if (mt) out.push(`${mt.meter.num}/${mt.meter.den}`);
  if (tp) out.push(`${glyph(tp.unit.den, tp.unit.dotted)}=${tp.bpm}`);
  const r = p.ramps.find((x) => x.from === i);
  if (r) out.push(r.endBpm > r.startBpm ? 'accel.' : 'rall.');
  const mk = marksLabel(p.measures[i]?.marks, rests);
  if (mk) out.push(mk);
  return out.join(' ');
}

export const inRamp = (p: Piece, i: number) => p.ramps.some((r) => r.from <= i && i <= r.to);
