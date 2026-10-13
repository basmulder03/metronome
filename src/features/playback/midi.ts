import type { Piece } from '../../shared/types';
import { buildTimeline, meterAt } from '../tempo-map/timeline';
import { levelOf, silentBar, type ClickOpts } from './audio';

const PPQ = 480;
// General MIDI percussion: hi wood block for the bar start, low wood block for the rest (velocity tells the strengths apart)
const NOTE = [77, 77, 76], VELOCITY = [55, 90, 120];

const vlq = (n: number) => {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
};
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

/**
 * The click track as a standard MIDI file (format 0, one track): the notes on the percussion channel, and the piece's tempo changes
 * and time signatures as real meta events, so a DAW follows the same tempo map. It plays at the written tempo (no speed setting).
 */
export function midiFile(title: string, piece: Piece, opts: ClickOpts): Uint8Array {
  const tl = buildTimeline(piece, 1);
  type Ev = { tick: number; order: number; bytes: number[] };
  const evs: Ev[] = [];
  const name = [...new TextEncoder().encode(title.slice(0, 100) || 'Click track')];
  evs.push({ tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(name.length), ...name] });

  let q = 0, lastTempo = -1, lastMeasure = -1, lastMeter = '';
  const first = tl.beats[0]?.step ?? 0;
  tl.beats.forEach((b, i) => {
    const mt = meterAt(piece, b.measure);
    const tick = Math.round(q * PPQ);
    const quarters = 4 / mt.den; // the length of this beat in quarter notes
    if (b.measure !== lastMeasure) {
      lastMeasure = b.measure;
      const key = `${mt.num}/${mt.den}`;
      if (key !== lastMeter) { lastMeter = key; evs.push({ tick, order: 1, bytes: [0xff, 0x58, 0x04, mt.num, Math.log2(mt.den), 24, 8] }); }
    }
    const dt = (tl.beats[i + 1]?.time ?? tl.duration) - b.time;
    const micros = Math.min(0xffffff, Math.max(1, Math.round((dt / quarters) * 1e6))); // microseconds per quarter note
    if (Math.abs(micros - lastTempo) > 1) { lastTempo = micros; evs.push({ tick, order: 2, bytes: [0xff, 0x51, 0x03, (micros >> 16) & 255, (micros >> 8) & 255, micros & 255] }); }
    const level = levelOf(b.accent, opts);
    if (level !== null && !silentBar(b.step - first, 0, opts.silent)) {
      evs.push({ tick, order: 3, bytes: [0x99, NOTE[level], VELOCITY[level]] });
      evs.push({ tick: tick + Math.round(PPQ / 8), order: 3, bytes: [0x89, NOTE[level], 0] });
    }
    q += quarters;
  });
  evs.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const body: number[] = [];
  let at = 0;
  for (const e of evs) { body.push(...vlq(e.tick - at), ...e.bytes); at = e.tick; }
  body.push(...vlq(0), 0xff, 0x2f, 0x00);
  return new Uint8Array([...'MThd'].map((c) => c.charCodeAt(0)).concat(u32(6), [0, 0, 0, 1, PPQ >> 8, PPQ & 255], [...'MTrk'].map((c) => c.charCodeAt(0)), u32(body.length), body));
}
