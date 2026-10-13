import type { Piece } from '../../shared/types';
import { validatePiece } from './validate';

const MAX_BYTES = 1_000_000; // decompressed size cap: a tiny link must not be able to expand into a huge payload

async function pipe(data: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream, cap = Infinity): Promise<Uint8Array> {
  const reader = new Blob([data]).stream().pipeThrough(stream).getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > cap) { await reader.cancel(); throw new Error('too large'); }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

const q = (n: number) => Math.round(n * 10000);
// sections point at boxes by id inside the app, and by position in a link (the importer makes its own ids)
function sectionsAsPositions(p: Piece) {
  const at = (id: string) => p.measures.findIndex((m) => m.id === id);
  const out = (p.sections ?? []).map((s) => ({ name: s.name, from: at(s.from), to: at(s.to) })).filter((s) => s.from >= 0 && s.to >= 0);
  return out.length ? out : undefined;
}
// no measure ids (imports make their own) and boxes as whole numbers in 1/10000 of the page: far shorter than UUIDs and long decimals
const squeeze = (piece: Piece) => ({ ...piece, sections: sectionsAsPositions(piece), measures: piece.measures.map((m) => [m.page, q(m.rect.x), q(m.rect.y), q(m.rect.w), q(m.rect.h), ...(m.marks ? [m.marks] : [])]) });
const expand = (p: { measures?: unknown }): Piece | null => {
  if (!Array.isArray(p?.measures)) return null;
  return validatePiece({ ...p, measures: p.measures.map((a: unknown) => Array.isArray(a)
    ? { page: a[0], rect: { x: a[1] / 10000, y: a[2] / 10000, w: a[3] / 10000, h: a[4] / 10000 }, marks: a[5] }
    : null) });
};
const pack = async (x: unknown) => b64(await pipe(new TextEncoder().encode(JSON.stringify(x)), new CompressionStream('deflate-raw')));
const unpack = async (code: string) => JSON.parse(new TextDecoder().decode(await pipe(unb64(code) as Uint8Array<ArrayBuffer>, new DecompressionStream('deflate-raw'), MAX_BYTES)));

export type Shared =
  | { kind: 'piece'; title: string; piece: Piece }
  | { kind: 'playlist'; title: string; gap: number; items: { title: string; piece: Piece }[] };

const MAX_PLAYLIST = 100;
const name = (t: unknown) => (typeof t === 'string' ? t.slice(0, 120) : '');

/** Markup only (never the PDF) as a compact URL-safe string. */
export const encodeShare = (title: string, piece: Piece) => pack({ v: 1, t: title, p: squeeze(piece) });

/** A playlist with the markup of its pieces (never PDFs). */
export const encodePlaylist = (title: string, gap: number, items: { title: string; piece: Piece }[]) =>
  pack({ v: 2, t: title, g: gap, i: items.map((x) => ({ t: x.title, p: squeeze(x.piece) })) });

/** A piece or a playlist from a code, or null for anything that is not a valid share payload. */
export async function decodeAny(code: string): Promise<Shared | null> {
  try {
    const x = await unpack(code);
    if (x?.v === 1 && typeof x.t === 'string') {
      const piece = expand(x.p);
      return piece ? { kind: 'piece', title: name(x.t), piece } : null;
    }
    if (x?.v === 2 && typeof x.t === 'string' && Array.isArray(x.i) && x.i.length > 0 && x.i.length <= MAX_PLAYLIST) {
      const items = [];
      for (const it of x.i) {
        const piece = expand(it?.p);
        if (!piece) return null;
        items.push({ title: name(it.t) || 'Untitled', piece });
      }
      const gap = typeof x.g === 'number' && x.g >= 0 && x.g <= 60 ? x.g : 4;
      return { kind: 'playlist', title: name(x.t), gap, items };
    }
    return null;
  } catch {
    return null;
  }
}

/** Returns null for anything that is not a valid single-piece share payload. */
export async function decodeShare(code: string): Promise<{ title: string; piece: Piece } | null> {
  const s = await decodeAny(code);
  return s?.kind === 'piece' ? s : null;
}
