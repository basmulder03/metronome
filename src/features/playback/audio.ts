import type { Beat, Timeline } from '../tempo-map/timeline';

/** `gap`: seconds of silence between laps when looping (a practice loop). */
export type ClickOpts = { subdivide: boolean; gap?: number };

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
export function beatRange(tl: Timeline, from: number, to: number, endStep?: number): [number, number] {
  const s0 = Math.max(0, tl.steps.findIndex((s) => s.measure === from));
  const k = to >= tl.measureCount - 1 ? -1 : tl.steps.findIndex((s, i) => i >= s0 && s.measure === to);
  // an explicit last step (the end of a part) wins over the measure: a repeat could play that measure before the part is over
  const s1 = endStep !== undefined ? Math.min(tl.steps.length, endStep + 1) : k < 0 ? tl.steps.length : k + 1;
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
  async play(tl: Timeline, from: number, to: number, loop: boolean, opts: ClickOpts, pre: Beat[] = [], endStep?: number): Promise<boolean> {
    this.stop(false);
    this.ctx ??= new AudioContext();
    await this.ctx.resume();
    const ctx = this.ctx;
    const [i0, iEnd] = beatRange(tl, from, to, endStep);
    if (i0 < 0 || iEnd <= i0) return false;
    this.whenDone = new Promise((res) => (this.settle = res));
    const t0 = tl.beats[i0].time;
    const tEnd = iEnd < tl.beats.length ? tl.beats[iEnd].time : tl.duration;
    const span = tEnd - t0;
    const lapLength = span + (loop ? Math.max(0, opts.gap ?? 0) : 0); // one lap: the clicks, then the rest
    const lead = pre.length ? -pre[0].time : 0;
    const origin = ctx.currentTime + 0.1 + lead;
    for (const b of pre) if (b.accent) click(ctx, origin + b.time, b.accent); // count-in clicks group starts only
    let i = i0, lap = 0;
    this.playing = true;

    // Lookahead scheduler: a coarse JS timer schedules clicks slightly ahead on the sample-accurate audio clock.
    const pump = () => {
      while (true) {
        const when = origin + lap * lapLength + (tl.beats[i].time - t0);
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
      // looping wraps round; a single run stays on its last measure until it stops, instead of flashing back to the first
      const into = loop ? elapsed % lapLength : Math.min(elapsed, span - 1e-6);
      this.onMeasure(into >= span ? -1 : measureAtTime(tl, t0 + into)); // -1: resting between laps
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
/** A click at `t` seconds from the start of the file. */
export type ClickEvent = { t: number; accent: 0 | 1 | 2 };
export type Job = { events: ClickEvent[]; seconds: number };

const TAIL_SECONDS = 0.5; // silence after the last click so the file does not cut off
const CLICK_RING = 0.05; // a click rings a little past its start; that part is carried into the next chunk

/** Everything a WAV needs for measures from..to: the clicks (count-in first) and the total length. */
export function clickEvents(tl: Timeline, from: number, to: number, opts: ClickOpts, pre: Beat[] = [], endStep?: number): Job {
  const [i0, iEnd] = beatRange(tl, from, to, endStep);
  const t0 = tl.beats[i0].time;
  const tEnd = iEnd < tl.beats.length ? tl.beats[iEnd].time : tl.duration;
  const lead = pre.length ? -pre[0].time : 0;
  const events: ClickEvent[] = [
    ...pre.filter((b) => b.accent).map((b) => ({ t: lead + b.time, accent: b.accent })),
    ...tl.beats.slice(i0, iEnd).filter((b) => audible(b.accent, opts)).map((b) => ({ t: lead + b.time - t0, accent: b.accent })),
  ];
  return { events, seconds: lead + tEnd - t0 + TAIL_SECONDS };
}

/** Put jobs one after another with silence between them (a playlist is just shifted clicks). */
export function joinJobs(jobs: Job[], gapSeconds: number): Job {
  const events: ClickEvent[] = [];
  let offset = 0;
  jobs.forEach((j, k) => {
    for (const e of j.events) events.push({ t: e.t + offset, accent: e.accent });
    offset += j.seconds + (k < jobs.length - 1 ? gapSeconds : 0);
  });
  return { events, seconds: offset };
}

type Render = (length: number, clicks: { at: number; accent: 0 | 1 | 2 }[], sampleRate: number) => Promise<Float32Array>;

const offlineRender: Render = async (length, clicks, sampleRate) => {
  const ctx = new OfflineAudioContext(1, length, sampleRate);
  for (const c of clicks) click(ctx, c.at, c.accent);
  return (await ctx.startRendering()).getChannelData(0);
};

type Samples = Int16Array<ArrayBuffer>;
const toInt16 = (f: Float32Array): Samples => {
  const out: Samples = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = Math.max(-1, Math.min(1, f[i])) * 0x7fff;
  return out;
};

/**
 * Render a job in windows of `chunkSeconds`, so memory is one window of floats (plus the 16-bit result) however long the job is.
 * The ring of a click that starts near the end of a window is carried into the next one.
 */
export async function* renderChunks(
  job: Job,
  { sampleRate = SAMPLE_RATE, chunkSeconds = 120, render = offlineRender }: { sampleRate?: number; chunkSeconds?: number; render?: Render } = {},
): AsyncGenerator<Samples> {
  const total = Math.ceil(job.seconds * sampleRate);
  const chunk = Math.max(1, Math.round(chunkSeconds * sampleRate));
  const tail = Math.ceil(CLICK_RING * sampleRate);
  const events = [...job.events].sort((a, b) => a.t - b.t);
  let next = 0;
  let carry = new Float32Array(0);
  for (let start = 0; start < total; start += chunk) {
    const len = Math.min(chunk, total - start);
    const clicks: { at: number; accent: 0 | 1 | 2 }[] = [];
    while (next < events.length && events[next].t * sampleRate < start + len) {
      const e = events[next++];
      clicks.push({ at: e.t - start / sampleRate, accent: e.accent });
    }
    const out = await render(len + tail, clicks, sampleRate);
    for (let i = 0; i < carry.length && i < out.length; i++) out[i] += carry[i];
    carry = out.slice(len);
    yield toInt16(out.subarray(0, len));
  }
}

/** Mono 16-bit WAV from rendered chunks. */
export function wavBlob(chunks: Samples[], sampleRate = SAMPLE_RATE): Blob {
  const samples = chunks.reduce((n, c) => n + c.length, 0);
  const head = new DataView(new ArrayBuffer(44));
  const str = (o: number, t: string) => [...t].forEach((c, k) => head.setUint8(o + k, c.charCodeAt(0)));
  str(0, 'RIFF'); head.setUint32(4, 36 + samples * 2, true); str(8, 'WAVEfmt ');
  head.setUint32(16, 16, true); head.setUint16(20, 1, true); head.setUint16(22, 1, true);
  head.setUint32(24, sampleRate, true); head.setUint32(28, sampleRate * 2, true);
  head.setUint16(32, 2, true); head.setUint16(34, 16, true); str(36, 'data'); head.setUint32(40, samples * 2, true);
  return new Blob([head, ...chunks], { type: 'audio/wav' });
}

export async function renderJob(job: Job, onProgress: (fraction: number) => void = () => {}): Promise<Blob> {
  const chunks: Samples[] = [];
  let done = 0;
  const total = Math.ceil(job.seconds * SAMPLE_RATE);
  for await (const c of renderChunks(job)) { chunks.push(c); done += c.length; onProgress(done / total); }
  return wavBlob(chunks);
}

// shortcut: the WAV is assembled in memory at 2 bytes per sample, about 320 MB per hour of audio; stream to a file if hour-long exports matter.
export const LONG_EXPORT_SECONDS = 30 * 60;

/** A warning to show before a very long export, or null when it is fine. */
export function longExportWarning(seconds: number): string | null {
  if (seconds <= LONG_EXPORT_SECONDS) return null;
  return `This export is about ${Math.round(seconds / 60)} minutes of audio (roughly ${Math.round((seconds * SAMPLE_RATE * 2) / 1e6)} MB). Phones and small computers may run out of memory. Continue?`;
}
