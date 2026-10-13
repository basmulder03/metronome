import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, type ClickOpts } from './audio';

// A fake audio clock, to see what each click is made of: its strength (volume) and whether it sounds at all.
let now = 0;
const peaks: number[] = [];
class FakeAudio {
  get currentTime() { return now; }
  destination = {};
  sampleRate = 44100;
  resume = async () => {};
  close = async () => {};
  createGain() { return { gain: { setValueAtTime: (v: number) => peaks.push(v), exponentialRampToValueAtTime: () => {} }, connect: () => ({ connect: () => {} }) }; }
  createOscillator() { return { type: '', frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: () => ({ connect: () => {} }), start: () => {}, stop: () => {} }; }
}

beforeEach(() => {
  now = 0;
  peaks.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('AudioContext', FakeAudio);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

// six beats a second apart: a bar start, then group starts
const tl = { beats: [2, 1, 1, 1, 1, 1].map((accent, i) => ({ time: i, measure: 0, step: 0, accent: accent as 1 | 2 })), steps: [{ measure: 0, time: 0 }], measureCount: 1, duration: 6, parts: [], partOfStep: [0] };
const tick = (to: number) => { now = to; vi.advanceTimersByTime(30); };

describe('changing the sound while it plays', () => {
  it('a new volume is heard on the next beat', async () => {
    let o: ClickOpts = { subdivide: false, volume: 1 };
    const p = new Player();
    await p.play(tl as never, 0, 0, false, () => o);
    expect(peaks).toEqual([1]); // the first beat, at full volume
    o = { ...o, volume: 0.5 };
    tick(1); // time reaches the second beat
    expect(peaks).toEqual([1, 0.7 * 0.5]);
    p.stop();
  });

  it('a new pattern and silent bars apply at once, too', async () => {
    let o: ClickOpts = { subdivide: false, pattern: 'groups' };
    const p = new Player();
    await p.play(tl as never, 0, 0, false, () => o);
    expect(peaks).toHaveLength(1);
    o = { subdivide: false, pattern: 'bar' }; // only the start of the bar sounds from now on
    tick(1); tick(2); tick(3);
    expect(peaks).toHaveLength(1); // the next beats are group starts, which this pattern leaves out
    o = { subdivide: false, pattern: 'even' };
    tick(4);
    expect(peaks).toHaveLength(2);
    o = { ...o, silent: 'alternate' }; // the first bar counts as bar 0: bar 1 would be silent, but there is only one bar here
    tick(5);
    expect(peaks).toHaveLength(3);
    p.stop();
  });

  it('plain options still work (a fixed object)', async () => {
    const p = new Player();
    await p.play(tl as never, 0, 0, false, { subdivide: false, volume: 0.25 });
    expect(peaks).toEqual([0.25]);
    p.stop();
  });
});
