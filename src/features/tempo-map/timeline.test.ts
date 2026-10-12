import { describe, expect, it } from 'vitest';
import { emptyPiece, type Piece } from '../../shared/types';
import { buildTimeline, countIn, ease, firstStepOf, maxRampEnd, parseGrouping, rampCovering, spanOf, stopStepFrom } from './timeline';

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
    expect(tl.steps[1].time).toBeCloseTo(2);
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
    expect(tl.duration - tl.steps[4].time).toBeCloseTo(2);
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

it('a repeated section plays (and sounds) twice', () => {
  const p = piece(2);
  p.tempos.push({ at: 0, bpm: 120, unit: q });
  p.measures[1].marks = { repeatEnd: 2 };
  const tl = buildTimeline(p);
  expect(tl.steps.map((s) => s.measure)).toEqual([0, 1, 0, 1]);
  expect(tl.duration).toBeCloseTo(8);
  expect(tl.beats.at(-1)!.step).toBe(3);
});

describe('pickup, fermata and count-in', () => {
  it('a pickup of 1 beat in 4/4 is one beat long and is not a downbeat', () => {
    const p = piece(2);
    p.tempos.push({ at: 0, bpm: 120, unit: q });
    p.measures[0].marks = { pickup: 1 };
    const tl = buildTimeline(p);
    expect(tl.steps[1].time).toBeCloseTo(0.5);
    expect(tl.beats[0]).toMatchObject({ measure: 0, accent: 1 }); // beat 4 of the bar: a beat accent, not the downbeat (2)
    expect(tl.duration).toBeCloseTo(0.5 + 2);
  });

  it('a 6/8 pickup of 3 eighths keeps the second group accent', () => {
    const p = piece(2);
    p.meters.push({ at: 0, meter: { num: 6, den: 8, grouping: [3, 3] } });
    p.measures[0].marks = { pickup: 3 };
    expect(buildTimeline(p).beats.slice(0, 3).map((b) => b.accent)).toEqual([1, 0, 0]);
  });

  it('a fermata stretches one beat', () => {
    const p = piece(1);
    p.tempos.push({ at: 0, bpm: 120, unit: q });
    p.measures[0].marks = { fermata: { beat: 3, factor: 3 } };
    expect(buildTimeline(p).duration).toBeCloseTo(0.5 * 3 + 1.5);
  });

  it('count-in repeats the first bar before the start, group starts only matter to the player', () => {
    const p = piece(2);
    p.tempos.push({ at: 0, bpm: 120, unit: q });
    const tl = buildTimeline(p);
    const pre = countIn(p, tl, 0, 2);
    expect(pre).toHaveLength(8);
    expect(pre[0].time).toBeCloseTo(-4);
    expect(pre.at(-1)!.time).toBeCloseTo(-0.5);
    expect(pre.map((b) => b.accent).slice(0, 4)).toEqual([2, 1, 1, 1]);
    expect(countIn(p, tl, 0, 0)).toEqual([]);
  });
});

describe('ramp ranges', () => {
  it('finds the ramp covering a measure and the room before the next ramp', () => {
    const p = piece(10);
    p.ramps.push({ from: 2, to: 4, startBpm: 100, endBpm: 80, curve: [0, 0, 1, 1] }, { from: 7, to: 8, startBpm: 80, endBpm: 60, curve: [0, 0, 1, 1] });
    expect(rampCovering(p, 3)?.from).toBe(2);
    expect(rampCovering(p, 5)).toBeUndefined();
    expect(maxRampEnd(p, 0)).toBe(1); // must stop before the ramp that starts at measure 2
    expect(maxRampEnd(p, 5)).toBe(6);
    expect(maxRampEnd(p, 8)).toBe(9); // nothing after it: up to the last measure
  });
});

describe('upbeats and short bars', () => {
  const q4 = { den: 4, dotted: false };
  const at = (bpm = 120) => { const p = piece(3); p.tempos.push({ at: 0, bpm, unit: q4 }); return p; };

  it('spanOf says which beats of the bar are written', () => {
    const p = piece(4);
    p.measures[0].marks = { pickup: 1 };
    p.measures[1].marks = { partial: 3 };
    p.measures[2].marks = { pickup: 1, partial: 3 }; // both: beats 4 only? no: from beat 4 to beat 3 is empty, so the whole bar
    expect(spanOf(p, 0)).toEqual([3, 4]);
    expect(spanOf(p, 1)).toEqual([0, 3]);
    expect(spanOf(p, 2)).toEqual([0, 4]);
    expect(spanOf(p, 3)).toEqual([0, 4]);
  });

  it('a short bar ends early and keeps the beat accents of the start', () => {
    const p = at();
    p.measures[2].marks = { partial: 2 };
    const tl = buildTimeline(p);
    expect(tl.steps[2].time).toBeCloseTo(4); // two full bars of 2 s
    expect(tl.duration).toBeCloseTo(4 + 1); // then a bar of two beats
    expect(tl.beats.filter((b) => b.measure === 2).map((b) => b.accent)).toEqual([2, 1]);
  });

  it('an upbeat piece that ends with the completing short bar adds up to whole bars', () => {
    const p = at();
    p.measures[0].marks = { pickup: 1 }; // beat 4
    p.measures[2].marks = { partial: 3 }; // beats 1-3
    expect(buildTimeline(p).duration).toBeCloseTo(0.5 + 2 + 1.5); // 1 + 4 + 3 beats at 0.5 s
  });

  it('the count-in for an upbeat is one pickup shorter, so the pickup completes the count', () => {
    const p = at();
    p.measures[0].marks = { pickup: 1 };
    const tl = buildTimeline(p);
    const pre = countIn(p, tl, 0, 1);
    expect(pre.map((b) => b.accent)).toEqual([2, 1, 1]); // "1 2 3", then the pickup is "4"
    expect(pre.map((b) => b.time)).toEqual([-1.5, -1, -0.5]);
    expect(countIn(p, tl, 0, 2)).toHaveLength(7); // 8 beats minus the one the pickup supplies
  });

  it('a pickup in 6/8 leaves the count-in aligned to the second group', () => {
    const p = piece(2);
    p.meters.push({ at: 0, meter: { num: 6, den: 8, grouping: [3, 3] } });
    p.tempos.push({ at: 0, bpm: 60, unit: { den: 4, dotted: true } });
    p.measures[0].marks = { pickup: 3 }; // the last three eighths
    const pre = countIn(p, buildTimeline(p), 0, 1);
    expect(pre.map((b) => b.accent)).toEqual([2, 0, 0]); // the first group, then the pickup is the second
  });

  it('a bar without marks counts in a whole bar, as before', () => {
    const p = at();
    expect(countIn(p, buildTimeline(p), 0, 1)).toHaveLength(4);
  });
});

describe('stopping at the end of a part', () => {
  const sheet = (n: number, marks: Record<number, object>) => {
    const p = piece(n);
    p.tempos.push({ at: 0, bpm: 120, unit: q });
    for (const [i, m] of Object.entries(marks)) p.measures[+i].marks = m;
    return p;
  };
  const parts2 = { 0: { part: { name: 'A' } }, 4: { part: { name: 'B' } } };

  it('a sheet without parts never stops', () => {
    const tl = buildTimeline(piece(6));
    expect(tl.parts).toEqual([]);
    expect(stopStepFrom(tl, 0, 'stop')).toBeUndefined();
  });

  it('in "stop" mode playback ends after the last step of the part it starts in', () => {
    const tl = buildTimeline(sheet(8, parts2));
    expect(stopStepFrom(tl, 0, 'stop')).toBe(3);
    expect(stopStepFrom(tl, 2, 'stop')).toBe(3); // starting in the middle of a part
    expect(stopStepFrom(tl, 4, 'stop')).toBeUndefined(); // the last part runs to the end
  });

  it('in "continue" mode only a part flagged to pause stops', () => {
    const tl = buildTimeline(sheet(8, parts2));
    expect(stopStepFrom(tl, 0, 'continue')).toBeUndefined();
    const flagged = buildTimeline(sheet(8, { 0: { part: { name: 'A', pause: true } }, 4: { part: { name: 'B' } } }));
    expect(stopStepFrom(flagged, 0, 'continue')).toBe(3);
  });

  it('a repeat inside a part does not end it, but the end of the repeated part does', () => {
    // measures 0-3 are part A with bars 1-2 repeated; the played order is 0 1 0 1 2 3 | 4 ...
    const tl = buildTimeline(sheet(8, { ...parts2, 1: { repeatEnd: 2 } }));
    expect(tl.steps.map((s) => s.measure)).toEqual([0, 1, 0, 1, 2, 3, 4, 5, 6, 7]);
    expect(stopStepFrom(tl, 0, 'stop')).toBe(5); // after the second pass, not after the first bar 2
  });

  it('a jump back across parts ends the part it leaves (D.C.)', () => {
    const tl = buildTimeline(sheet(8, { ...parts2, 7: { jump: 'dc' } }));
    expect(tl.steps.map((s) => s.measure)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7]);
    expect(stopStepFrom(tl, 0, 'stop')).toBe(3);
    expect(stopStepFrom(tl, 4, 'stop')).toBe(7); // B ends where the jump takes it back into A
    expect(stopStepFrom(tl, 8, 'stop')).toBe(11);
  });

  it('firstStepOf finds where a measure is first played', () => {
    const tl = buildTimeline(sheet(8, { 1: { repeatEnd: 2 } }));
    expect(firstStepOf(tl, 2)).toBe(4);
    expect(firstStepOf(tl, 0)).toBe(0);
  });
});
