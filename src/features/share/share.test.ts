import { describe, expect, it } from 'vitest';
import { emptyPiece, type Piece } from '../../shared/types';
import { decodeAny, decodeShare, encodePlaylist, encodeShare } from './codec';
import { validatePiece } from './validate';

const sample = (): Piece => {
  const p = emptyPiece();
  for (let i = 0; i < 4; i++) p.measures.push({ id: `x${i}`, page: 0, rect: { x: i / 4, y: 0.1, w: 0.25, h: 0.05 } });
  p.measures[3].marks = { repeatEnd: 2, fermata: { beat: 3, factor: 2 } };
  p.meters.push({ at: 0, meter: { num: 7, den: 8, grouping: [2, 2, 3] } });
  p.tempos.push({ at: 0, bpm: 96, unit: { den: 4, dotted: true } });
  p.ramps.push({ from: 1, to: 3, startBpm: 96, endBpm: 70, curve: [0.42, 0, 0.58, 1] });
  p.countIn = 1;
  return p;
};

describe('share codec', () => {
  it('round-trips markup and regenerates measure ids', async () => {
    const code = await encodeShare('Étude', sample());
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const out = await decodeShare(code);
    expect(out?.title).toBe('Étude');
    expect(out?.piece.measures).toHaveLength(4);
    expect(out?.piece.measures[0].id).not.toBe('x0');
    expect(out?.piece.measures[3].marks).toEqual({ repeatEnd: 2, fermata: { beat: 3, factor: 2 } });
    expect(out?.piece.ramps[0].curve).toEqual([0.42, 0, 0.58, 1]);
  });

  it('links stay short', async () => {
    const p = emptyPiece();
    for (let i = 0; i < 200; i++) p.measures.push({ id: `${i}`, page: Math.floor(i / 40), rect: { x: (i % 5) / 5, y: 0.1, w: 0.2, h: 0.05 } });
    expect((await encodeShare('Long', p)).length).toBeLessThan(4000);
  });

  it('rejects garbage', async () => {
    expect(await decodeShare('not-a-payload')).toBeNull();
    expect(await decodeShare('')).toBeNull();
  });

  it('refuses a decompression bomb', async () => {
    const huge = { v: 1, t: 'x', p: { measures: [], pad: 'a'.repeat(5_000_000) } };
    const bytes = new TextEncoder().encode(JSON.stringify(huge));
    const out = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
    const code = btoa(String.fromCharCode(...new Uint8Array(out))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await decodeShare(code)).toBeNull();
  });
});

describe('validatePiece', () => {
  it('keeps part marks and the stop-after-part setting, drops bad names', () => {
    const x = JSON.parse(JSON.stringify(sample()));
    x.afterPart = 'stop';
    x.measures[0].marks = { part: { name: 'Intro', pause: true } };
    x.measures[1].marks = { part: { name: 'x'.repeat(81) } };
    x.measures[2].marks = { part: { name: 42 } };
    const p = validatePiece(x)!;
    expect(p.afterPart).toBe('stop');
    expect(p.measures[0].marks).toEqual({ part: { name: 'Intro', pause: true } });
    expect(p.measures[1].marks).toBeUndefined();
    expect(p.measures[2].marks).toBeUndefined();
    expect(validatePiece({ ...x, afterPart: 'whatever' })!.afterPart).toBeUndefined();
  });

  it('keeps an upbeat and a short bar, drops nonsense counts', () => {
    const x = JSON.parse(JSON.stringify(sample()));
    x.measures[0].marks = { pickup: 1, partial: 3 };
    x.measures[1].marks = { pickup: 0, partial: 999 };
    const p = validatePiece(x)!;
    expect(p.measures[0].marks).toEqual({ pickup: 1, partial: 3 });
    expect(p.measures[1].marks).toBeUndefined();
  });

  it('drops unknown keys and bad marks, keeps good ones', () => {
    const x = JSON.parse(JSON.stringify(sample()));
    x.measures[0].marks = { repeatEnd: 999, evil: true, segno: true };
    x.measures[0].__proto__x = 1;
    const p = validatePiece(x)!;
    expect(p.measures[0].marks).toEqual({ segno: true });
  });

  it.each([
    ['no measures', { measures: [] }],
    ['rect outside the page', { measures: [{ page: 0, rect: { x: 2, y: 0, w: 0.1, h: 0.1 } }] }],
    ['negative bpm', { measures: [{ page: 0, rect: { x: 0, y: 0, w: 0.5, h: 0.5 } }], tempos: [{ at: 0, bpm: -5, unit: { den: 4, dotted: false } }] }],
    ['event beyond the last measure', { measures: [{ page: 0, rect: { x: 0, y: 0, w: 0.5, h: 0.5 } }], tempos: [{ at: 5, bpm: 100, unit: { den: 4, dotted: false } }] }],
    ['grouping that does not add up', { measures: [{ page: 0, rect: { x: 0, y: 0, w: 0.5, h: 0.5 } }], meters: [{ at: 0, meter: { num: 7, den: 8, grouping: [2, 2, 2] } }] }],
    ['not an object', 42],
  ])('rejects %s', (_n, x) => expect(validatePiece(x)).toBeNull());
});

describe('copyright guard', () => {
  it('a share payload never contains PDF data, only the whitelisted markup fields', async () => {
    const p = sample();
    // even if something sneaks onto the piece object, validation strips it and the payload stays tiny
    Object.assign(p, { pdf: 'JVBERi0xLjQK'.repeat(1000), blob: 'x'.repeat(5000) });
    const code = await encodeShare('Étude', p);
    const out = (await decodeShare(code))!;
    expect(Object.keys(out.piece).sort()).toEqual(['countIn', 'measures', 'meters', 'ramps', 'tempos']);
    expect(JSON.stringify(out.piece)).not.toContain('JVBERi'); // base64 PDF header
  });
});

describe('compact links', () => {
  it('round-trips boxes to 4 decimals and is much shorter than a verbose encoding', async () => {
    const ms = Array.from({ length: 300 }, (_, i) => ({ id: crypto.randomUUID(), page: i % 10, rect: { x: (i % 5) / 5 + 0.0123456, y: 0.1234567, w: 0.1876543, h: 0.0612345 }, ...(i === 3 && { marks: { multirest: 4 } }) }));
    const piece = { measures: ms, meters: [], tempos: [], ramps: [], countIn: 0 };
    const code = await encodeShare('t', piece as never);
    expect(code.length).toBeLessThan(2500);
    const back = await decodeShare(code);
    expect(back!.piece.measures).toHaveLength(300);
    expect(back!.piece.measures[3].marks).toEqual({ multirest: 4 });
    expect(back!.piece.measures[1].rect.x).toBeCloseTo(ms[1].rect.x, 4);
  });
});

describe('playlist share', () => {
  it('round-trips pieces and gap, and a piece code is not a playlist', async () => {
    const code = await encodePlaylist('Gig', 6, [{ title: 'A', piece: sample() }, { title: 'B', piece: sample() }]);
    const out = await decodeAny(code);
    expect(out?.kind).toBe('playlist');
    if (out?.kind !== 'playlist') return;
    expect(out.gap).toBe(6);
    expect(out.items.map((x) => x.title)).toEqual(['A', 'B']);
    expect(out.items[1].piece.measures).toHaveLength(4);
    expect(await decodeShare(code)).toBeNull();
  });

  it('rejects a playlist with one bad piece or none', async () => {
    const bad = { ...sample(), measures: [{ page: 0, rect: { x: 2, y: 0, w: 0.1, h: 0.1 } }] } as never;
    expect(await decodeAny(await encodePlaylist('x', 4, [{ title: 'A', piece: sample() }, { title: 'B', piece: bad }]))).toBeNull();
    expect(await decodeAny(await encodePlaylist('x', 4, []))).toBeNull();
  });
});

describe('saved practice sections', () => {
  const withSections = () => {
    const p = sample();
    p.sections = [{ name: 'Hard run', from: 'x1', to: 'x2' }, { name: 'Gone', from: 'x1', to: 'nope' }];
    return p;
  };

  it('survive a share link, as positions, and the importer gets its own ids', async () => {
    const out = (await decodeShare(await encodeShare('S', withSections())))!;
    expect(out.piece.sections).toHaveLength(1); // the one pointing at a missing box is dropped
    const [s] = out.piece.sections!;
    expect(s.name).toBe('Hard run');
    expect(out.piece.measures.findIndex((m) => m.id === s.from)).toBe(1);
    expect(out.piece.measures.findIndex((m) => m.id === s.to)).toBe(2);
  });

  it('survive a backup file, which keeps the ids', () => {
    const json = JSON.parse(JSON.stringify(withSections()));
    const p = validatePiece(json)!;
    expect(p.sections).toHaveLength(1);
    expect(p.measures.findIndex((m) => m.id === p.sections![0].to)).toBe(2);
  });

  it('refuse junk: names, counts, positions out of range', () => {
    const x = JSON.parse(JSON.stringify(sample()));
    x.sections = [{ name: '', from: 0, to: 1 }, { name: 'x'.repeat(81), from: 0, to: 1 }, { name: 'ok', from: 0, to: 99 }, { name: 'fine', from: 0, to: 3 }, 7, null];
    expect(validatePiece(x)!.sections!.map((s) => s.name)).toEqual(['fine']);
  });
});

describe('validatePiece keepIds', () => {
  it('keeps good, unique ids for synced data, and never for imports', () => {
    const x = JSON.parse(JSON.stringify(sample()));
    x.measures[1].id = x.measures[0].id; // a duplicate
    x.measures[2].id = 'has space';
    const kept = validatePiece(x, { keepIds: true })!;
    expect(kept.measures[0].id).toBe('x0');
    expect(kept.measures[1].id).not.toBe('x0');
    expect(kept.measures[2].id).not.toBe('has space');
    expect(kept.measures[3].id).toBe('x3');
    expect(validatePiece(x)!.measures[0].id).not.toBe('x0');
  });
});
