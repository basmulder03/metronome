import type { Measure, Piece, Unit } from '../../shared/types';
import { DEFAULT_BPM } from '../../shared/types';
import { defaultGrouping } from '../tempo-map/timeline';

/** A run of text from a PDF page, in PDF points with the origin at the page's top-left (y is the baseline). */
export type TextItem = { str: string; x: number; y: number; w: number; size: number };
export type PageText = { page: number; width: number; height: number; items: TextItem[] };

export type Suggestion = { id: string; text: string; low?: boolean } & (
  | { kind: 'meter'; measure: number; num: number; den: number }
  | { kind: 'tempo'; measure: number; bpm: number; unit: Unit }
  | { kind: 'ramp'; from: number; to: number; startBpm: number; endBpm: number }
);

const DENS = [1, 2, 4, 8, 16, 32];
const MAX_RAMP_MEASURES = 8;

// Note glyphs as engravers export them (music-font letters and Unicode/SMuFL symbols).
const NOTE: Record<string, number> = { q: 4, e: 8, h: 2, w: 1, '♩': 4, '♪': 8, '': 4, '': 8, '': 2 };
const DOT = /[.·•]/;

const RAMP_WORDS: { re: RegExp; factor: number; label: string }[] = [
  { re: /\bmolto\s+(rit|rall|ritard)/i, factor: 0.55, label: 'molto rall.' },
  { re: /\bpoco\s+(a\s+poco\s+)?(rit|rall|ritard)/i, factor: 0.85, label: 'poco rall.' },
  { re: /\b(rit|ritard|ritardando|rall|rallent|rallentando|allarg|allargando)\b\.?/i, factor: 0.7, label: 'rall.' },
  { re: /\bmolto\s+accel/i, factor: 1.4, label: 'molto accel.' },
  { re: /\b(accel|accelerando|string|stringendo)\b\.?/i, factor: 1.25, label: 'accel.' },
  { re: /\bcalmando\b/i, factor: 0.85, label: 'calmando' },
];
const A_TEMPO = /\b(a\s+tempo|tempo\s+primo|tempo\s+i\b)/i;

type Box = { x0: number; y0: number; x1: number; y1: number };
const boxOf = (m: Measure): Box => ({ x0: m.rect.x, y0: m.rect.y, x1: m.rect.x + m.rect.w, y1: m.rect.y + m.rect.h });

/**
 * Pick the measure a text anchor belongs to (anchor in page fractions).
 * `above` is for marks printed over the staff (tempo, rit.): they belong to the system just below them.
 */
function locate(measures: Measure[], page: number, ax: number, ay: number, above: boolean): number {
  let best = -1, bestCost = Infinity;
  measures.forEach((m, i) => {
    if (m.page !== page) return;
    const b = boxOf(m);
    const dx = ax < b.x0 ? b.x0 - ax : ax > b.x1 ? ax - b.x1 : 0;
    const dy = ay < b.y0 ? b.y0 - ay : ay > b.y1 ? ay - b.y1 : 0;
    // text above a system pulls toward it; text below a system should never pick it over the next one
    const cost = dx + dy * (above && ay < b.y0 ? 1 : 3);
    if (cost < bestCost) { bestCost = cost; best = i; }
  });
  return best;
}

const isDigits = (s: string) => /^\d{1,2}$/.test(s.trim());

/** Stacked digit pairs (numerator over denominator) in a music font: the vertical gap is half the font size. */
function meterPairs(items: TextItem[]) {
  const out: { num: number; den: number; x: number; y: number }[] = [];
  const digits = items.filter((i) => isDigits(i.str));
  for (const a of digits) {
    for (const b of digits) {
      if (a === b || b.y <= a.y) continue;
      const dy = b.y - a.y;
      const cx = Math.abs(a.x + a.w / 2 - (b.x + b.w / 2));
      if (Math.abs(a.size - b.size) > 0.5 || a.size < 8) continue;
      if (dy < a.size * 0.4 || dy > a.size * 0.6 || cx > a.size * 0.3) continue;
      const num = +a.str.trim(), den = +b.str.trim();
      if (num >= 1 && num <= 32 && DENS.includes(den)) out.push({ num, den, x: Math.min(a.x, b.x), y: a.y });
    }
  }
  return out;
}

const compound = (num: number, den: number) => den >= 8 && num > 3 && num % 3 === 0;

function noteUnit(glyph: string | undefined, num: number, den: number): { unit: Unit; guess: boolean } {
  const g = glyph?.trim() ?? '';
  const base = [...g].map((c) => NOTE[c]).find(Boolean);
  if (base) return { unit: { den: base, dotted: DOT.test(g) }, guess: false };
  return { unit: compound(num, den) ? { den: 4, dotted: true } : { den: 4, dotted: false }, guess: true };
}

/**
 * Read tempo marks, time signatures and rit./accel. words from the text layer of a digitally produced PDF.
 * Everything is a suggestion: the user reviews it before anything changes. Scanned PDFs have no text layer and yield nothing.
 * shortcut: the glyph/word tables cover common engraver output; extend them when a real score is misread.
 */
export function suggestFromText(pages: PageText[], piece: Pick<Piece, 'measures' | 'tempos' | 'meters'>): Suggestion[] {
  const { measures } = piece;
  type Found = Suggestion & { order: number; sortKey: [page: number, y: number, x: number, size: number] };
  const found: Found[] = [];
  const add = (s: Suggestion, page: number, y: number, x: number, measure: number, size = 12) =>
    found.push({ ...s, order: measure, sortKey: [page, y, x, size] } as Found);

  for (const p of pages) {
    const nx = (x: number) => x / p.width, ny = (y: number) => y / p.height;

    // time signatures
    for (const m of meterPairs(p.items)) {
      const at = locate(measures, p.page, nx(m.x + 1), ny(m.y), false);
      if (at >= 0) add({ id: '', kind: 'meter', measure: at, num: m.num, den: m.den, text: `${m.num}/${m.den}` }, p.page, m.y, m.x, at);
    }

    // tempo marks: "= 130", with the note glyph just before it (as its own item or inside the same string)
    for (const it of p.items) {
      // "♩ = 130" anywhere in the run (OCR can glue neighbouring text to it); the glyph is whatever is just before the "="
      const t = /^(?:.*\s)?(\S{0,3})\s*=\s*(\d{2,3})(?:\s*[-–]\s*\d{2,3})?[)\]]?(?:\s.*)?$/.exec(it.str);
      if (!t) continue;
      const bpm = +t[2];
      if (bpm < 20 || bpm > 400) continue;
      const prev = p.items.filter((o) => o !== it && o.str.trim().length <= 3 && Math.abs(o.y - it.y) < it.size * 0.4 && it.x - (o.x + o.w) < it.size * 0.6 && it.x - (o.x + o.w) > -it.size * 0.3).sort((a, b) => b.x - a.x)[0];
      const glyph = t[1].trim() || prev?.str;
      let left = t[1].trim() ? it.x : prev?.x ?? it.x;
      // "Andante Maestoso (♪=63-66)": the instruction starts at its first word, not at the number
      for (;;) {
        // (OCR reports inconsistent heights for words on one line, so the reach uses the largest involved)
        const word = p.items.filter((o) => o !== it && /^\p{L}{3,}[.,]?$/u.test(o.str.trim()) && Math.abs(o.y - it.y) < Math.max(o.size, it.size) * 0.8 && o.x < left && left - (o.x + o.w) < Math.max(o.size, it.size) * 3.5).sort((a, b) => b.x - a.x)[0];
        if (!word) break;
        left = word.x;
      }
      const at = locate(measures, p.page, nx(left + 1), ny(it.y), true);
      if (at < 0) continue;
      const meter = found.filter((f) => f.kind === 'meter' && f.measure <= at).at(-1) as { num: number; den: number } | undefined;
      const { unit, guess } = noteUnit(glyph, meter?.num ?? 4, meter?.den ?? 4);
      const label = `${unit.dotted ? '♩.' : unit.den === 4 ? '♩' : unit.den === 8 ? '♪' : '𝅗𝅥'} = ${bpm}${guess ? ' (beat unit guessed)' : ''}`;
      add({ id: '', kind: 'tempo', measure: at, bpm, unit, text: label, low: guess }, p.page, it.y, left, at, it.size);
    }

    // rit./accel. words and "a tempo"
    for (const it of p.items) {
      // OCR returns "molto" and "rall." as separate words on slightly different baselines: pick up a neighbouring modifier
      const modifier = p.items.find((o) => /^(molto|poco)\.?$/i.test(o.str.trim()) && it.x - (o.x + o.w) < it.size * 2 && it.x - (o.x + o.w) > -it.size * 0.5 && Math.abs(o.y - it.y) < it.size * 3);
      const str = modifier && !/^(molto|poco)\b/i.test(it.str) ? `${modifier.str.trim()} ${it.str.trim()}` : it.str;
      const word = RAMP_WORDS.find((w) => w.re.test(str));
      if (word) {
        const x = modifier ? Math.min(modifier.x, it.x) : it.x;
        const at = locate(measures, p.page, nx(x + 1), ny(it.y), true);
        if (at >= 0) add({ id: '', kind: 'ramp', from: at, to: at, startBpm: 0, endBpm: word.factor, text: str.trim() || word.label }, p.page, it.y, x, at, it.size);
      } else if (A_TEMPO.test(it.str)) {
        const at = locate(measures, p.page, nx(it.x + 1), ny(it.y), true);
        if (at >= 0) add({ id: '', kind: 'tempo', measure: at, bpm: -1, unit: { den: 4, dotted: false }, text: 'a tempo', low: true }, p.page, it.y, it.x, at, it.size);
      }
    }
  }

  // reading order, then resolve tempos in force, "a tempo" and ramp extents
  // reading order: baselines within half a font size are the same line (a tempo mark and "rall." never share an exact y)
  found.sort((a, b) => a.sortKey[0] - b.sortKey[0] || (Math.abs(a.sortKey[1] - b.sortKey[1]) > Math.min(a.sortKey[3], b.sortKey[3]) * 0.5 ? a.sortKey[1] - b.sortKey[1] : a.sortKey[2] - b.sortKey[2]));
  const existing = (m: number) => piece.tempos.filter((t) => t.at <= m).sort((a, b) => b.at - a.at)[0];
  const result: Suggestion[] = [];
  let current = existing(0)?.bpm ?? DEFAULT_BPM;
  let unit: Unit = existing(0)?.unit ?? { den: 4, dotted: false };
  let beforeRamp = current;
  const seen = new Set<string>();
  const pending: Found[] = found;

  for (let i = 0; i < pending.length; i++) {
    const f = pending[i];
    const key = `${f.kind}:${f.kind === 'ramp' ? f.from : f.measure}`;
    if (seen.has(key)) continue; // one of each kind per measure (grand staffs repeat the time signature)
    seen.add(key);

    if (f.kind === 'tempo') {
      if (f.bpm < 0) { f.bpm = beforeRamp; f.unit = unit; f.text = `a tempo (back to ${Math.round(beforeRamp)})`; }
      else { current = f.bpm; unit = f.unit; beforeRamp = f.bpm; }
    }
    if (f.kind === 'ramp') {
      const factor = f.endBpm;
      const next = pending.slice(i + 1).find((n) => n.kind === 'tempo' && n.order > f.from);
      const to = Math.max(f.from, Math.min(next ? next.order - 1 : f.from + 1, f.from + MAX_RAMP_MEASURES - 1, measures.length - 1));
      beforeRamp = current;
      f.to = to;
      f.startBpm = Math.round(current);
      f.endBpm = Math.max(20, Math.min(400, Math.round(current * factor)));
      f.low = true; // the end tempo is a guess; the curve editor is where it gets tuned
      f.text = `${f.text}: ${f.startBpm} → ${f.endBpm}`;
    }
    const { order: _o, sortKey: _k, ...s } = f;
    result.push({ ...s, id: `${s.kind}-${i}` } as Suggestion);
  }
  return result;
}

/** Add the chosen suggestions to the piece without overwriting anything the user already set. Returns how many were skipped. */
export function applySuggestions(piece: Piece, chosen: Suggestion[]): { applied: number; skipped: number } {
  let applied = 0, skipped = 0;
  for (const s of chosen) {
    if (s.kind === 'meter') {
      if (piece.meters.some((e) => e.at === s.measure)) { skipped++; continue; }
      piece.meters.push({ at: s.measure, meter: { num: s.num, den: s.den, grouping: defaultGrouping(s.num, s.den) } });
    } else if (s.kind === 'tempo') {
      if (piece.tempos.some((e) => e.at === s.measure)) { skipped++; continue; }
      piece.tempos.push({ at: s.measure, bpm: s.bpm, unit: { ...s.unit } });
    } else {
      if (piece.ramps.some((r) => r.from <= s.to && s.from <= r.to)) { skipped++; continue; }
      piece.ramps.push({ from: s.from, to: s.to, startBpm: s.startBpm, endBpm: s.endBpm, curve: [0.42, 0, 0.58, 1] });
    }
    applied++;
  }
  return { applied, skipped };
}
