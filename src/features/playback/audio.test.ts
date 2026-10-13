import { describe, expect, it } from 'vitest';
import { emptyPiece } from '../../shared/types';
import { buildTimeline } from '../tempo-map/timeline';
import { beatRange, clickEvents, joinJobs, longExportWarning, renderChunks, wavBlob, type Job } from './audio';

// A fake click: a 1.0 sample at its start and a 0.5 ring over the next 3 samples, like a real click that rings on.
const SR = 100;
const fakeRender = async (length: number, clicks: { at: number }[], sampleRate: number) => {
  const out = new Float32Array(length);
  for (const c of clicks) {
    const i = Math.round(c.at * sampleRate);
    for (let k = 0; k < 4 && i + k < length; k++) out[i + k] += k === 0 ? 1 : 0.5;
  }
  return out;
};
const all = async (job: Job, chunkSeconds: number) => {
  const parts: Int16Array[] = [];
  for await (const c of renderChunks(job, { sampleRate: SR, chunkSeconds, render: fakeRender })) parts.push(c);
  return Int16Array.from(parts.flatMap((p) => [...p]));
};

describe('renderChunks', () => {
  const job: Job = { events: [0.995, 1.0, 2.5, 3.99].map((t) => ({ t, accent: 2 as const })), seconds: 4.5 };

  it('gives the same audio however it is cut into chunks', async () => {
    const whole = await all(job, 1000);
    expect(whole).toHaveLength(450);
    for (const size of [1, 0.5, 2.5]) expect([...(await all(job, size))]).toEqual([...whole]);
  });

  it('carries the ring of a click that starts just before a chunk boundary', async () => {
    const out = await all({ events: [{ t: 0.99, accent: 2 }], seconds: 2 }, 1); // boundary at sample 100; click at 99, ring covers 100-102
    for (const i of [99, 100, 101, 102]) expect(out[i]).toBeGreaterThan(0); // starts in chunk 1, rings into chunk 2
    expect(out[103]).toBe(0);
    expect(out[98]).toBe(0);
  });

  it('never keeps more than one chunk of floats at a time', async () => {
    const sizes: number[] = [];
    const spy = async (length: number, clicks: { at: number }[], sampleRate: number) => { sizes.push(length); return fakeRender(length, clicks, sampleRate); };
    for await (const _ of renderChunks({ events: [], seconds: 3600 }, { sampleRate: SR, chunkSeconds: 120, render: spy })) void _;
    expect(Math.max(...sizes)).toBeLessThanOrEqual(120 * SR + 10); // 30 chunks, none larger than a window plus the ring
    expect(sizes).toHaveLength(30);
  });

  it('adds up to exactly the job length, with a short last chunk', async () => {
    expect(await all({ events: [], seconds: 2.5 }, 1)).toHaveLength(250);
  });
});

describe('jobs', () => {
  it('a playlist is the pieces shifted by their length and the gaps', () => {
    const a: Job = { events: [{ t: 0, accent: 2 }, { t: 1, accent: 1 }], seconds: 3 };
    const b: Job = { events: [{ t: 0.5, accent: 2 }], seconds: 2 };
    const j = joinJobs([a, b], 4);
    expect(j.events.map((e) => e.t)).toEqual([0, 1, 7.5]); // b starts at 3 + 4
    expect(j.seconds).toBe(9);
    expect(joinJobs([a], 4).seconds).toBe(3); // no gap after the last piece
  });

  it('builds clicks and length from a timeline, count-in first', () => {
    const tl = { beats: [{ time: 0, measure: 0, step: 0, accent: 2 as const }, { time: 0.5, measure: 0, step: 0, accent: 1 as const }, { time: 1, measure: 0, step: 0, accent: 0 as const }], steps: [{ measure: 0, time: 0 }], measureCount: 1, duration: 1.5, parts: [], partOfStep: [0] };
    const pre = [{ time: -1, measure: 0, step: -1, accent: 2 as const }, { time: -0.5, measure: 0, step: -1, accent: 0 as const }];
    const job = clickEvents(tl, 0, 0, { subdivide: false }, pre);
    expect(job.events).toEqual([{ t: 0, accent: 2 }, { t: 1, accent: 2 }, { t: 1.5, accent: 1 }]); // subdivision (accent 0) left out
    expect(job.seconds).toBeCloseTo(1 + 1.5 + 0.5);
  });
});

describe('wavBlob', () => {
  it('writes a valid mono 16-bit header around the chunks', async () => {
    const buf = new DataView(await wavBlob([new Int16Array(60), new Int16Array(40)], 44100).arrayBuffer());
    expect(String.fromCharCode(buf.getUint8(0), buf.getUint8(1), buf.getUint8(2), buf.getUint8(3))).toBe('RIFF');
    expect(buf.getUint32(24, true)).toBe(44100);
    expect(buf.getUint32(40, true)).toBe(200);
    expect(buf.byteLength).toBe(244);
  });
});

describe('longExportWarning', () => {
  it('is quiet for normal exports and warns with a size for very long ones', () => {
    expect(longExportWarning(10 * 60)).toBeNull();
    expect(longExportWarning(60 * 60)).toMatch(/60 minutes.*318 MB/);
  });
});

describe('beatRange with an explicit end step', () => {
  // 4 measures of 4/4, a repeat at measure 1: the played order is 0 1 0 1 2 3
  const mk = () => {
    const p = emptyPiece();
    for (let i = 0; i < 4; i++) p.measures.push({ id: `${i}`, page: 0, rect: { x: 0, y: 0, w: 0.1, h: 0.1 } });
    p.measures[1].marks = { repeatEnd: 2 };
    p.tempos.push({ at: 0, bpm: 120, unit: { den: 4, dotted: false } });
    return buildTimeline(p);
  };

  it('ends after the given step even if the measure it names was already played', () => {
    const tl = mk();
    const [i0, iEnd] = beatRange(tl, 0, 3, 3); // through the second pass of the repeat, not to the end
    expect(i0).toBe(0);
    expect(tl.beats[iEnd].step).toBe(4); // the next beat belongs to step 4: measure 2
    expect(iEnd).toBe(16);
  });

  it('without it the old measure rule applies', () => {
    const tl = mk();
    expect(beatRange(tl, 0, 3)[1]).toBe(tl.beats.length);
  });
});

describe('click patterns', () => {
  // 12/8 grouped 3+3+3+3: bar start, then a group start every third beat
  const accents = [2, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0] as const;
  const tl = {
    beats: accents.map((accent, i) => ({ time: i * 0.25, measure: 0, step: 0, accent })),
    steps: [{ measure: 0, time: 0 }], measureCount: 1, duration: 3, parts: [], partOfStep: [0],
  };
  const play = (o: Partial<Parameters<typeof clickEvents>[3]>) => clickEvents(tl, 0, 0, { subdivide: false, ...o }).events.map((e) => e.accent).join('');

  it('groups: 1 2 2 2, every beat: 1 3 3 2 3 3 …, even: 1 1 1 1, bar: 1', () => {
    expect(play({ pattern: 'groups' })).toBe('2111'); // accent 2 = strongest, 1 = group start
    expect(play({ pattern: 'all' })).toBe('200100100100'); // 0 = soft subdivision
    expect(play({ pattern: 'even' })).toBe('2222');
    expect(play({ pattern: 'bar' })).toBe('2');
  });

  it('the older subdivide switch still means every beat', () => {
    expect(play({ subdivide: true })).toBe('200100100100');
  });

  it('the sound settings travel with the job, so an export sounds like playback', () => {
    expect(clickEvents(tl, 0, 0, { subdivide: false, kit: 'wood', volume: 0.5 }).sound).toEqual({ kit: 'wood', volume: 0.5 });
  });
});
