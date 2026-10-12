import type { Beat, Timeline } from '../tempo-map/timeline';

export type ClickOpts = { subdivide: boolean };

const PITCH = [800, 1100, 1600];
const GAIN = [0.3, 0.7, 1];

/** One click: a 30 ms decaying sine. Shared by live playback and offline render so both sound identical. */
function click(ctx: BaseAudioContext, at: number, accent: 0 | 1 | 2) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.value = PITCH[accent];
  g.gain.setValueAtTime(GAIN[accent], at);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.03);
  osc.connect(g).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.04);
}

const audible = (accent: number, o: ClickOpts) => o.subdivide || accent > 0;

/**
 * Beat range [i0, iEnd) for playing measures from..to (written positions) in playing order.
 * Starts at the first time `from` is played; ends after the first time `to` is played from there (or at the end if `to` is last).
 */
export function beatRange(tl: Timeline, from: number, to: number): [number, number] {
  const s0 = Math.max(0, tl.steps.findIndex((s) => s.measure === from));
  const k = to >= tl.measureCount - 1 ? -1 : tl.steps.findIndex((s, i) => i >= s0 && s.measure === to);
  const s1 = k < 0 ? tl.steps.length : k + 1;
  const i0 = tl.beats.findIndex((b) => b.step >= s0);
  const iEnd = s1 >= tl.steps.length ? tl.beats.length : tl.beats.findIndex((b) => b.step >= s1);
  return [i0, iEnd];
}

/** Written measure sounding at `t` seconds (binary search over steps). */
export function measureAtTime(tl: Timeline, t: number): number {
  let lo = 0, hi = tl.steps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tl.steps[mid].time <= t) lo = mid; else hi = mid - 1;
  }
  return tl.steps[lo]?.measure ?? 0;
}

export class Player {
  private ctx?: AudioContext;
  private timer = 0;
  private endTimer = 0;
  private raf = 0;
  /** Called each frame with the current measure index. */
  onMeasure: (m: number) => void = () => {};
  onStop: () => void = () => {};
  playing = false;
  /** Settles after play(): true when the range finished by itself, false when stopped early. */
  whenDone: Promise<boolean> = Promise.resolve(false);
  private settle: (completed: boolean) => void = () => {};

  /** Play measures from..to (inclusive), optionally looping; resolves true once started. Must be called from a user gesture. */
  /** `pre` is an optional count-in (beats with negative times relative to the first played beat), sounded once. */
  async play(tl: Timeline, from: number, to: number, loop: boolean, opts: ClickOpts, pre: Beat[] = []): Promise<boolean> {
    this.stop(false);
    this.ctx ??= new AudioContext();
    await this.ctx.resume();
    const ctx = this.ctx;
    const [i0, iEnd] = beatRange(tl, from, to);
    if (i0 < 0 || iEnd <= i0) return false;
    this.whenDone = new Promise((res) => (this.settle = res));
    const t0 = tl.beats[i0].time;
    const tEnd = iEnd < tl.beats.length ? tl.beats[iEnd].time : tl.duration;
    const span = tEnd - t0;
    const lead = pre.length ? -pre[0].time : 0;
    const origin = ctx.currentTime + 0.1 + lead;
    for (const b of pre) if (b.accent) click(ctx, origin + b.time, b.accent); // count-in clicks group starts only
    let i = i0, lap = 0;
    this.playing = true;

    // Lookahead scheduler: a coarse JS timer schedules clicks slightly ahead on the sample-accurate audio clock.
    const pump = () => {
      while (true) {
        const when = origin + lap * span + (tl.beats[i].time - t0);
        if (when > ctx.currentTime + 0.2) return;
        if (audible(tl.beats[i].accent, opts)) click(ctx, when, tl.beats[i].accent);
        if (++i >= iEnd) {
          if (!loop) {
            clearInterval(this.timer);
            this.endTimer = window.setTimeout(() => this.stop(true, true), (origin + span - ctx.currentTime) * 1000 + 100);
            return;
          }
          i = i0; lap++;
        }
      }
    };
    this.timer = window.setInterval(pump, 25);
    pump();

    const frame = () => {
      const elapsed = Math.max(0, ctx.currentTime - origin);
      this.onMeasure(measureAtTime(tl, t0 + (elapsed % span)));
      this.raf = requestAnimationFrame(frame);
    };
    frame();
    return true;
  }

  stop(notify = true, completed = false) {
    clearInterval(this.timer);
    clearTimeout(this.endTimer);
    cancelAnimationFrame(this.raf);
    if (this.ctx) { void this.ctx.close(); this.ctx = undefined; } // closing silences clicks already scheduled
    if (this.playing && notify) this.onStop();
    if (this.playing) this.settle(completed);
    this.playing = false;
  }
}

export const SAMPLE_RATE = 44100;

/** Render measures from..to to mono samples, faster than real time and entirely in the browser. */
export async function renderPcm(tl: Timeline, from: number, to: number, opts: ClickOpts, pre: Beat[] = [], sampleRate = SAMPLE_RATE): Promise<Float32Array> {
  const [i0, iEnd] = beatRange(tl, from, to);
  const t0 = tl.beats[i0].time;
  const tEnd = iEnd < tl.beats.length ? tl.beats[iEnd].time : tl.duration;
  const lead = pre.length ? -pre[0].time : 0;
  const ctx = new OfflineAudioContext(1, Math.ceil((lead + tEnd - t0 + 0.5) * sampleRate), sampleRate);
  for (const b of pre) if (b.accent) click(ctx, lead + b.time, b.accent);
  for (const b of tl.beats.slice(i0, iEnd)) if (audible(b.accent, opts)) click(ctx, lead + b.time - t0, b.accent);
  return (await ctx.startRendering()).getChannelData(0);
}

export async function renderWav(tl: Timeline, from: number, to: number, opts: ClickOpts, pre: Beat[] = []): Promise<Blob> {
  return wavBlob(await renderPcm(tl, from, to, opts, pre), SAMPLE_RATE);
}

/** Join pieces of audio with silence between them. */
export function concatPcm(parts: Float32Array[], gapSeconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const gap = Math.round(gapSeconds * sampleRate);
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0) + gap * Math.max(0, parts.length - 1));
  let o = 0;
  parts.forEach((p, i) => { out.set(p, o); o += p.length + (i < parts.length - 1 ? gap : 0); });
  return out;
}

export function wavBlob(data: Float32Array, sampleRate: number): Blob {
  const out = new DataView(new ArrayBuffer(44 + data.length * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); out.setUint32(4, 36 + data.length * 2, true); str(8, 'WAVEfmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, sampleRate, true); out.setUint32(28, sampleRate * 2, true);
  out.setUint16(32, 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, data.length * 2, true);
  data.forEach((s, i) => out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Blob([out], { type: 'audio/wav' });
}
