import { describe, expect, it } from 'vitest';
import { emptyPiece, type Measure } from '../../shared/types';
import { bandsAbove, wordsToItems, type Word } from './ocr';
import { suggestFromText } from './readmarks';

const w = (text: string, x0: number, x1: number, y1 = 30, confidence = 90): Word => ({ text, x0, x1, y0: y1 - 12, y1, confidence });

describe('wordsToItems', () => {
  it('converts pixels to points and keeps ordinary words separate', () => {
    const items = wordsToItems([w('molto', 100, 160), w('rall.', 166, 211)], 2, { x: 0, y: 50 });
    expect(items.map((i) => i.str)).toEqual(['molto', 'rall.']);
    expect(items[0]).toMatchObject({ x: 50, y: 65 });
    expect(items[0].w).toBeCloseTo(30);
  });

  it('glues an equals sign to its number without a space', () => {
    expect(wordsToItems([w('F', 400, 412), w('=', 416, 424), w('130', 428, 460)], 1, { x: 0, y: 0 })[0].str).toBe('F=130');
  });

  it('keeps a tempo mark Tesseract scored 0 and trims stray marks after a phrase', () => {
    const items = wordsToItems([w('F=130', 400, 460, 30, 0), w('molto', 10, 60, 70), w('rall.', 66, 100, 70), w('_', 104, 112, 70)], 1, { x: 0, y: 0 });
    expect(items.map((i) => i.str)).toEqual(['F=130', 'molto', 'rall.']);
  });

  it('keeps distant words apart and drops low-confidence noise', () => {
    const items = wordsToItems([w('Am', 10, 40), w('D7', 300, 330), w('xq', 100, 120, 30, 10)], 1, { x: 0, y: 0 });
    expect(items.map((i) => i.str)).toEqual(['Am', 'D7']);
  });

  it('feeds the same reader as a real text layer', () => {
    const m = (i: number): Measure => ({ id: `${i}`, page: 0, rect: { x: 0.1 + i * 0.25, y: 0.3, w: 0.25, h: 0.1 } });
    const piece = { ...emptyPiece(), measures: [0, 1, 2].map(m) };
    // "F=130" above bar 1 and "molto rall." above bar 2, as OCR returns them (scale 2: 1190 x 1684 px for a 595 x 842 page)
    const words = [w('F', 120, 134, 480), w('=130', 138, 190, 480), w('molto', 500, 560, 480), w('rall.', 566, 620, 480)];
    const items = wordsToItems(words, 2, { x: 0, y: 0 });
    const s = suggestFromText([{ page: 0, width: 595, height: 842, items }], piece);
    expect(s.find((x) => x.kind === 'tempo')).toMatchObject({ measure: 0, bpm: 130, low: true }); // glyph unreadable: unit guessed
    expect(s.find((x) => x.kind === 'ramp')).toMatchObject({ from: 1, startBpm: 130 });
  });
});

describe('bandsAbove', () => {
  const box = (x: number, y: number): Measure => ({ id: `${x}${y}`, page: 0, rect: { x, y, w: 0.2, h: 0.1 } });

  it('gives one strip per system, bounded by the system above', () => {
    const bands = bandsAbove([box(0.1, 0.2), box(0.3, 0.2), box(0.1, 0.5)], 0);
    expect(bands).toHaveLength(2);
    expect(bands[0].y0).toBeGreaterThanOrEqual(0);
    expect(bands[0].y1).toBeCloseTo(0.206);
    expect(bands[1].y0).toBeGreaterThan(0.3); // below the first system's bottom (0.3)
    expect(bands[1].y1).toBeCloseTo(0.506);
  });

  it('only looks at the requested page', () => {
    expect(bandsAbove([{ ...box(0.1, 0.2), page: 1 }], 0)).toEqual([]);
  });
});
