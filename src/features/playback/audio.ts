import type { Timeline } from '../tempo-map/timeline';

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

  /** Play measures from..to (inclusive), optionally looping. Must be called from a user gesture. */
  async play(tl: Timeline, from: number, to: number, loop: boolean, opts: ClickOpts) {
    this.stop(false);
    this.ctx ??= new AudioContext();
    await this.ctx.resume();
    const ctx = this.ctx;
    const [i0, iEnd] = beatRange(tl, from, to);
    if (i0 < 0 || iEnd <= i0) return;
    const t0 = tl.beats[i0].time;
    const tEnd = iEnd < tl.beats.length ? tl.beats[iEnd].time : tl.duration;
    const span = tEnd - t0;
    const origin = ctx.currentTime + 0.1;
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
            this.endTimer = window.setTimeout(() => this.stop(), (origin + span - ctx.currentTime) * 1000 + 100);
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
  }

  stop(notify = true) {
    clearInterval(this.timer);
    clearTimeout(this.endTimer);
    cancelAnimationFrame(this.raf);
    if (this.ctx) { void this.ctx.close(); this.ctx = undefined; } // closing silences clicks already scheduled
    if (this.playing && notify) this.onStop();
    this.playing = false;
  }
}

/** Render measures from..to to a mono 16-bit WAV, faster than real time and entirely in the browser. */
export async function renderWav(tl: Timeline, from: number, to: number, opts: ClickOpts, sampleRate = 44100): Promise<Blob> {
  const [i0, iEnd] = beatRange(tl, from, to);
  const t0 = tl.beats[i0].time;
  const tEnd = iEnd < tl.beats.length ? tl.beats[iEnd].time : tl.duration;
  const ctx = new OfflineAudioContext(1, Math.ceil((tEnd - t0 + 0.5) * sampleRate), sampleRate);
  for (const b of tl.beats.slice(i0, iEnd)) if (audible(b.accent, opts)) click(ctx, b.time - t0, b.accent);
  return encodeWav(await ctx.startRendering());
}

function encodeWav(buf: AudioBuffer): Blob {
  const data = buf.getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + data.length * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); out.setUint32(4, 36 + data.length * 2, true); str(8, 'WAVEfmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * 2, true);
  out.setUint16(32, 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, data.length * 2, true);
  data.forEach((s, i) => out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Blob([out], { type: 'audio/wav' });
}
