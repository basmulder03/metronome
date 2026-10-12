import { describe, expect, it } from 'vitest';
import { emptyPiece, type Measure, type Piece } from '../../shared/types';
import { applySuggestions, suggestFromText, type PageText, type TextItem } from './readmarks';

// Page 595 x 842 pt. Two systems of 3 measures each (boxes in page fractions), like the real Minuet's layout.
const W = 595, H = 842;
const box = (i: number, sys: number): Measure => ({ id: `m${i}`, page: 0, rect: { x: 0.18 + (i % 3) * 0.25, y: sys === 0 ? 0.3 : 0.55, w: 0.25, h: 0.12 } });
const piece = (): Piece => ({ ...emptyPiece(), measures: [0, 1, 2].map((i) => box(i, 0)).concat([3, 4, 5].map((i) => box(i, 1))) });
const item = (str: string, x: number, y: number, size = 13, w = str.length * size * 0.5): TextItem => ({ str, x, y, w, size });
const page = (...items: TextItem[]): PageText[] => [{ page: 0, width: W, height: H, items }];

// positions mirror the real score: tempo mark above system 1, time signature digits inside it
const SYS0_TOP = 0.3 * H; // 252.6
const SYS1_TOP = 0.55 * H; // 463.1

describe('suggestFromText', () => {
  it('reads a tempo mark with its note glyph', () => {
    const s = suggestFromText(page(item('q', 104, SYS0_TOP - 12, 13, 5), item('=130', 110, SYS0_TOP - 12)), piece());
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: 'tempo', measure: 0, bpm: 130, unit: { den: 4, dotted: false } });
    expect(s[0].low).toBeFalsy();
  });

  it('reads the note value from the glyph, including dotted', () => {
    const s = suggestFromText(page(item('q.', 104, SYS0_TOP - 12, 13, 8), item('=60', 112, SYS0_TOP - 12)), piece());
    expect(s[0]).toMatchObject({ bpm: 60, unit: { den: 4, dotted: true } });
  });

  it('takes the note glyph from inside the same string too', () => {
    const s = suggestFromText(page(item('♩ = 96', 104, SYS0_TOP - 12, 13, 40)), piece());
    expect(s[0]).toMatchObject({ kind: 'tempo', bpm: 96, unit: { den: 4, dotted: false } });
  });

  it('reads a tempo mark with a range and a closing bracket, as OCR returns "(♪=63-66)"', () => {
    const s = suggestFromText(page(item('(}=63-66)', 104, SYS0_TOP - 12, 13, 60)), piece());
    expect(s[0]).toMatchObject({ kind: 'tempo', measure: 0, bpm: 63 });
    expect(s[0].low).toBe(true); // the symbol was junk: the beat unit is a guess
  });

  it('a tempo mark applies from the first word of its instruction, not from the number', () => {
    // boxes: bar 1 is x 107-256 pt, bar 2 is 256-405. The words start over bar 1; the "= 63-66" lands over bar 2.
    // sizes as a real scan reports them: inconsistent from word to word on the same line
    const items = [item('Andante', 112, SYS0_TOP - 11, 8, 35), item('Maestoso', 190, SYS0_TOP - 12, 15, 39), item('=63-66)', 262, SYS0_TOP - 12, 13, 30)];
    expect(suggestFromText(page(...items), piece())[0]).toMatchObject({ kind: 'tempo', measure: 0, bpm: 63 });
  });

  it('does not reach back across a wide gap to unrelated words', () => {
    const items = [item('Andante', 112, SYS0_TOP - 12, 13, 40), item('(}=63-66)', 300, SYS0_TOP - 12, 13, 60)]; // 148 pt apart
    expect(suggestFromText(page(...items), piece())[0]).toMatchObject({ measure: 1 });
  });

  it('treats "calmando" as a gentle slow-down', () => {
    const items = [item('q', 104, SYS0_TOP - 12, 13, 5), item('=100', 110, SYS0_TOP - 12), item('calmando', 0.43 * W, SYS0_TOP - 12, 13, 50)];
    expect(suggestFromText(page(...items), piece()).find((x) => x.kind === 'ramp')).toMatchObject({ startBpm: 100, endBpm: 85 });
  });

  it('guesses the beat unit (and says so) when the glyph is unknown, dotted for compound meters', () => {
    const p = piece();
    const s = suggestFromText(page(item('Z', 104, SYS0_TOP - 12, 13, 5), item('=60', 110, SYS0_TOP - 12)), p);
    expect(s[0]).toMatchObject({ bpm: 60, unit: { den: 4, dotted: false }, low: true });
    expect(s[0].text).toContain('guessed');
    // a 6/8 signature at the start makes the guess a dotted quarter
    const six = [item('6', 118, 150, 20, 8), item('8', 118, 160, 20, 8), item('Z', 104, SYS0_TOP - 12, 13, 5), item('=60', 110, SYS0_TOP - 12)];
    const s2 = suggestFromText(page(...six.map((i, k) => (k < 2 ? { ...i, y: SYS0_TOP + 10 + k * 10 } : i))), piece());
    expect(s2.find((x) => x.kind === 'tempo')).toMatchObject({ unit: { den: 4, dotted: true } });
  });

  it('finds a time signature from stacked music-font digits and ignores fingerings', () => {
    const items = [
      item('3', 118, SYS0_TOP + 10, 20, 8), item('4', 118, SYS0_TOP + 20, 20, 8), // stacked, gap = half the font size
      item('1', 123, SYS0_TOP + 40, 7, 4), item('2', 123, SYS0_TOP + 50, 7, 4), // fingering: far too small
      item('7', 69, SYS0_TOP, 11, 6), // a measure number
    ];
    const s = suggestFromText(page(...items), piece());
    expect(s).toEqual([expect.objectContaining({ kind: 'meter', measure: 0, num: 3, den: 4 })]);
  });

  it('merges the repeated time signature of a grand staff into one suggestion', () => {
    const pair = (y: number) => [item('3', 118, y, 20, 8), item('4', 118, y + 10, 20, 8)];
    const s = suggestFromText(page(...pair(SYS0_TOP + 10), ...pair(SYS0_TOP + 55)), piece());
    expect(s.filter((x) => x.kind === 'meter')).toHaveLength(1);
  });

  it('rejects impossible time signatures', () => {
    const s = suggestFromText(page(item('3', 118, SYS0_TOP + 10, 20, 8), item('5', 118, SYS0_TOP + 20, 20, 8)), piece()); // denominator 5
    expect(s).toEqual([]);
  });

  it('turns "molto rall." into a ramp that ends before the next tempo mark', () => {
    const items = [
      item('q', 104, SYS0_TOP - 12, 13, 5), item('=130', 110, SYS0_TOP - 12),
      item('molto rall.', 0.43 * W, SYS1_TOP - 12, 13, 66), // above measure 3 (x 0.43 -> 0.43..0.68 is measure 4? boxes start 0.18, 0.43, 0.68)
      item('q', 0.7 * W, SYS1_TOP - 12, 13, 5), item('=130', 0.7 * W + 6, SYS1_TOP - 12),
    ];
    const s = suggestFromText(page(...items), piece());
    const ramp = s.find((x) => x.kind === 'ramp')!;
    expect(ramp).toMatchObject({ kind: 'ramp', from: 4, to: 4, startBpm: 130, endBpm: Math.round(130 * 0.55), low: true });
    expect(s.filter((x) => x.kind === 'tempo').map((x) => x.kind === 'tempo' && x.measure)).toEqual([0, 5]);
  });

  it('a tempo mark and a rit. word on the same printed line are read left to right, even with slightly different baselines', () => {
    const items = [
      item('q', 104, SYS0_TOP - 12, 13, 5), item('=130', 110, SYS0_TOP - 12),
      item('molto rall.', 0.43 * W, SYS1_TOP - 12.4, 13, 66), // baseline 0.4 pt lower than the tempo mark that follows it
      item('q', 0.7 * W, SYS1_TOP - 12, 13, 5), item('=130', 0.7 * W + 6, SYS1_TOP - 12),
    ];
    const ramp = suggestFromText(page(...items), piece()).find((x) => x.kind === 'ramp')!;
    expect(ramp).toMatchObject({ from: 4, to: 4 }); // ends before the tempo mark at measure 6
  });

  it('attaches a separate "molto" word to the rit. next to it (as OCR returns them)', () => {
    const items = [item('q', 104, SYS0_TOP - 12, 13, 5), item('=130', 110, SYS0_TOP - 12), item('molto', 0.43 * W, SYS1_TOP - 12, 13, 32), item('rall.', 0.43 * W + 36, SYS1_TOP - 4, 13, 24)];
    const ramp = suggestFromText(page(...items), piece()).find((x) => x.kind === 'ramp')!;
    expect(ramp).toMatchObject({ from: 4, endBpm: Math.round(130 * 0.55) });
    expect(ramp.text).toContain('molto rall.');
  });

  it('plain rit. and accel. use gentler factors, and a tempo is the one in force', () => {
    const items = [item('q', 104, SYS0_TOP - 12, 13, 5), item('=100', 110, SYS0_TOP - 12), item('rit.', 0.43 * W, SYS0_TOP - 12, 13, 20), item('accel.', 0.43 * W, SYS1_TOP - 12, 13, 30)];
    const s = suggestFromText(page(...items), piece());
    const ramps = s.filter((x) => x.kind === 'ramp');
    expect(ramps[0]).toMatchObject({ from: 1, startBpm: 100, endBpm: 70 });
    expect(ramps[1]).toMatchObject({ from: 4, startBpm: 100, endBpm: 125 });
  });

  it('"a tempo" returns to the tempo before the ramp', () => {
    const items = [item('q', 104, SYS0_TOP - 12, 13, 5), item('=120', 110, SYS0_TOP - 12), item('rit.', 0.43 * W, SYS0_TOP - 12, 13, 20), item('a tempo', 0.68 * W, SYS0_TOP - 12, 13, 40)];
    const s = suggestFromText(page(...items), piece());
    expect(s.find((x) => x.kind === 'ramp')).toMatchObject({ from: 1, to: 1 });
    expect(s.filter((x) => x.kind === 'tempo').at(-1)).toMatchObject({ measure: 2, bpm: 120 });
  });

  it('has nothing to say about a page without such text', () => {
    expect(suggestFromText(page(item('Minuet in G', 136, 67, 22), item('Piano', 35, 181)), piece())).toEqual([]);
    expect(suggestFromText([], piece())).toEqual([]);
  });

  it('text just under a system belongs to the next system, not the one above', () => {
    const s = suggestFromText(page(item('q', 104, SYS1_TOP - 5, 13, 5), item('=90', 110, SYS1_TOP - 5)), piece());
    expect(s[0]).toMatchObject({ kind: 'tempo', measure: 3 });
  });
});

describe('applySuggestions', () => {
  it('adds events but never overwrites what the user set', () => {
    const p = piece();
    p.tempos.push({ at: 0, bpm: 80, unit: { den: 4, dotted: false } });
    p.meters.push({ at: 3, meter: { num: 2, den: 4, grouping: [1, 1] } });
    const res = applySuggestions(p, [
      { id: 'a', kind: 'tempo', measure: 0, bpm: 130, unit: { den: 4, dotted: false }, text: '' },
      { id: 'b', kind: 'tempo', measure: 3, bpm: 90, unit: { den: 4, dotted: false }, text: '' },
      { id: 'c', kind: 'meter', measure: 3, num: 6, den: 8, text: '' },
      { id: 'd', kind: 'meter', measure: 0, num: 6, den: 8, text: '' },
      { id: 'e', kind: 'ramp', from: 1, to: 2, startBpm: 90, endBpm: 60, text: '' },
      { id: 'f', kind: 'ramp', from: 2, to: 4, startBpm: 90, endBpm: 60, text: '' }, // overlaps e
    ]);
    expect(res).toEqual({ applied: 3, skipped: 3 });
    expect(p.tempos).toEqual([{ at: 0, bpm: 80, unit: { den: 4, dotted: false } }, { at: 3, bpm: 90, unit: { den: 4, dotted: false } }]);
    expect(p.meters.find((m) => m.at === 0)?.meter).toEqual({ num: 6, den: 8, grouping: [3, 3] });
    expect(p.ramps).toHaveLength(1);
  });
});
