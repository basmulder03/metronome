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

/** Markup only (never the PDF) as a compact URL-safe string. */
export async function encodeShare(title: string, piece: Piece): Promise<string> {
  // v2: no measure ids (imports make their own) and boxes as whole numbers in 1/10000 of the page: far shorter than UUIDs and long decimals
  const q = (n: number) => Math.round(n * 10000);
  const measures = piece.measures.map((m) => [m.page, q(m.rect.x), q(m.rect.y), q(m.rect.w), q(m.rect.h), ...(m.marks ? [m.marks] : [])]);
  const json = new TextEncoder().encode(JSON.stringify({ v: 2, t: title, p: { ...piece, measures } }));
  return b64(await pipe(json, new CompressionStream('deflate-raw')));
}

/** Returns null for anything that is not a valid share payload. */
export async function decodeShare(code: string): Promise<{ title: string; piece: Piece } | null> {
  try {
    const raw = await pipe(unb64(code) as Uint8Array<ArrayBuffer>, new DecompressionStream('deflate-raw'), MAX_BYTES);
    const x = JSON.parse(new TextDecoder().decode(raw));
    if ((x?.v !== 1 && x?.v !== 2) || typeof x.t !== 'string') return null;
    if (x.v === 2) {
      if (!Array.isArray(x.p?.measures)) return null;
      x.p.measures = x.p.measures.map((a: unknown) => Array.isArray(a)
        ? { page: a[0], rect: { x: a[1] / 10000, y: a[2] / 10000, w: a[3] / 10000, h: a[4] / 10000 }, marks: a[5] }
        : null);
    }
    const piece = validatePiece(x.p);
    return piece ? { title: x.t.slice(0, 120), piece } : null;
  } catch {
    return null;
  }
}

export const shareUrl = (code: string) => `${location.origin}${location.pathname}#share=${code}`;
export const codeFromHash = (hash: string) => (hash.startsWith('#share=') ? hash.slice(7) : null);
