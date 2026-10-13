import { describe, expect, it } from 'vitest';
import { emptyPiece, type Piece } from '../../shared/types';
import { midiFile } from './midi';

// a small reader of what midiFile writes
function read(bytes: Uint8Array) {
  const ascii = (o: number, n: number) => String.fromCharCode(...bytes.slice(o, o + n));
  const out = { header: ascii(0, 4), format: bytes[9], ppq: (bytes[12] << 8) | bytes[13], track: ascii(14, 4), notes: [] as { tick: number; note: number; velocity: number }[], tempos: [] as { tick: number; bpm: number }[], meters: [] as { tick: number; meter: string }[], end: false };
  let o = 22, tick = 0;
  const vlq = () => { let v = 0, b; do { b = bytes[o++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
  while (o < bytes.length) {
    tick += vlq();
    const s = bytes[o++];
    if (s === 0xff) {
      const type = bytes[o++], len = vlq();
      if (type === 0x51) out.tempos.push({ tick, bpm: Math.round(6e7 / ((bytes[o] << 16) | (bytes[o + 1] << 8) | bytes[o + 2])) });
      if (type === 0x58) out.meters.push({ tick, meter: `${bytes[o]}/${2 ** bytes[o + 1]}` });
      if (type === 0x2f) out.end = true;
      o += len;
    } else if (s === 0x99) { out.notes.push({ tick, note: bytes[o], velocity: bytes[o + 1] }); o += 2; } else o += 2; // note off
  }
  return out;
}

const piece = (n: number): Piece => {
  const p = emptyPiece();
  for (let i = 0; i < n; i++) p.measures.push({ id: `m${i}`, page: 0, rect: { x: 0, y: 0, w: 0.1, h: 0.1 } });
  return p;
};
const opts = { subdivide: false };

describe('MIDI export', () => {
  it('writes a valid file: header, one track, 4/4 at 120 with a strong first beat', () => {
    const p = piece(2);
    p.tempos.push({ at: 0, bpm: 120, unit: { den: 4, dotted: false } });
    const m = read(midiFile('Étude', p, opts));
    expect([m.header, m.format, m.ppq, m.track, m.end]).toEqual(['MThd', 0, 480, 'MTrk', true]);
    expect(m.meters).toEqual([{ tick: 0, meter: '4/4' }]);
    expect(m.tempos).toEqual([{ tick: 0, bpm: 120 }]);
    expect(m.notes).toHaveLength(8); // two bars of four beats
    expect(m.notes.map((n) => n.tick)).toEqual([0, 480, 960, 1440, 1920, 2400, 2880, 3360]);
    expect(m.notes[0].velocity).toBeGreaterThan(m.notes[1].velocity);
  });

  it('keeps tempo changes and time signatures where they happen, per quarter note', () => {
    const p = piece(3);
    p.tempos.push({ at: 0, bpm: 100, unit: { den: 4, dotted: false } }, { at: 2, bpm: 60, unit: { den: 4, dotted: false } });
    p.meters.push({ at: 1, meter: { num: 3, den: 4, grouping: [1, 1, 1] } });
    const m = read(midiFile('t', p, opts));
    expect(m.tempos).toEqual([{ tick: 0, bpm: 100 }, { tick: (4 + 3) * 480, bpm: 60 }]); // after a bar of 4/4 and a bar of 3/4
    expect(m.meters).toEqual([{ tick: 0, meter: '4/4' }, { tick: 4 * 480, meter: '3/4' }]);
  });

  it('a compound meter counts in eighths, and the click pattern decides which beats are written', () => {
    const p = piece(1);
    p.meters.push({ at: 0, meter: { num: 12, den: 8, grouping: [3, 3, 3, 3] } });
    p.tempos.push({ at: 0, bpm: 60, unit: { den: 4, dotted: true } }); // dotted quarter = 60
    expect(read(midiFile('t', p, opts)).notes).toHaveLength(4); // group starts only
    const all = read(midiFile('t', p, { subdivide: true }));
    expect(all.notes).toHaveLength(12);
    expect(all.notes[1].tick - all.notes[0].tick).toBe(240); // an eighth note
    expect(all.tempos[0].bpm).toBe(90); // 60 dotted quarters a minute is 90 quarters a minute
  });
});
