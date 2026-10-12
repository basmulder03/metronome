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
  const json = new TextEncoder().encode(JSON.stringify({ v: 1, t: title, p: piece }));
  return b64(await pipe(json, new CompressionStream('deflate-raw')));
}

/** Returns null for anything that is not a valid share payload. */
export async function decodeShare(code: string): Promise<{ title: string; piece: Piece } | null> {
  try {
    const raw = await pipe(unb64(code) as Uint8Array<ArrayBuffer>, new DecompressionStream('deflate-raw'), MAX_BYTES);
    const x = JSON.parse(new TextDecoder().decode(raw));
    if (x?.v !== 1 || typeof x.t !== 'string') return null;
    const piece = validatePiece(x.p);
    return piece ? { title: x.t.slice(0, 120), piece } : null;
  } catch {
    return null;
  }
}

export const shareUrl = (code: string) => `${location.origin}${location.pathname}#share=${code}`;
export const codeFromHash = (hash: string) => (hash.startsWith('#share=') ? hash.slice(7) : null);
