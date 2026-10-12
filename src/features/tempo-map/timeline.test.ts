import { describe, expect, it } from 'vitest';
import { emptyPiece, type Piece } from '../../shared/types';
import { buildTimeline, ease, parseGrouping } from './timeline';

const piece = (n: number): Piece => {
  const p = emptyPiece();
  for (let i = 0; i < n; i++) p.measures.push({ id: `m${i}`, page: 0, rect: { x: i / n, y: 0, w: 1 / n, h: 0.1 } });
  return p;
};
const q = { den: 4, dotted: false };

describe('timeline', () => {
  it('4/4 at 120 gives half-second beats', () => {
    const p = piece(2);
    p.tempos.push({ at: 0, bpm: 120, unit: q });
    const tl = buildTimeline(p);
    expect(tl.beats.map((b) => b.time)).toEqual(expect.arrayContaining([0]));
    expect(tl.beats[1].time).toBeCloseTo(0.5);
    expect(tl.measureStart[1]).toBeCloseTo(2);
    expect(tl.duration).toBeCloseTo(4);
  });

  it('6/8 with dotted-quarter=60 clicks groups one second apart', () => {
    const p = piece(1);
    p.meters.push({ at: 0, meter: { num: 6, den: 8, grouping: [3, 3] } });
    p.tempos.push({ at: 0, bpm: 60, unit: { den: 4, dotted: true } });
    const tl = buildTimeline(p);
    const groups = tl.beats.filter((b) => b.accent > 0);
    expect(groups.map((b) => b.time)).toEqual([expect.closeTo(0), expect.closeTo(1)]);
    expect(tl.duration).toBeCloseTo(2);
  });

  it('7/8 2+2+3 accents land on 0, 2, 4', () => {
    const p = piece(1);
    p.meters.push({ at: 0, meter: { num: 7, den: 8, grouping: [2, 2, 3] } });
    const tl = buildTimeline(p);
    expect(tl.beats.flatMap((b, i) => (b.accent ? [i] : []))).toEqual([0, 2, 4]);
  });

  it('linear ramp 60->120 over 4 bars of 4/4 takes 16*ln2 s', () => {
    const p = piece(4);
    p.tempos.push({ at: 0, bpm: 60, unit: q });
    p.ramps.push({ from: 0, to: 3, startBpm: 60, endBpm: 120, curve: [0, 0, 1, 1] });
    expect(buildTimeline(p).duration).toBeCloseTo(16 * Math.LN2, 2);
  });

  it('tempo continues at the ramp end value afterwards', () => {
    const p = piece(5);
    p.tempos.push({ at: 0, bpm: 60, unit: q });
    p.ramps.push({ from: 0, to: 3, startBpm: 60, endBpm: 120, curve: [0, 0, 1, 1] });
    const tl = buildTimeline(p);
    expect(tl.duration - tl.measureStart[4]).toBeCloseTo(2);
  });

  it('ease-in is slower than linear at the midpoint', () => {
    expect(ease([0, 0, 1, 1], 0.5)).toBeCloseTo(0.5, 3);
    expect(ease([0.42, 0, 1, 1], 0.5)).toBeLessThan(0.4);
  });
});

it('parseGrouping validates the sum', () => {
  expect(parseGrouping('2+2+3', 7)).toEqual([2, 2, 3]);
  expect(parseGrouping('2+2+2', 7)).toBeNull();
});
