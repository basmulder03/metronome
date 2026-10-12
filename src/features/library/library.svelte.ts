import { all, del, get, put } from '../../shared/idb';
import { emptyPiece, type Piece } from '../../shared/types';

export type Entry = { id: string; title: string; updated: number; hasPdf: boolean; piece: Piece };

export const lib = $state({ entries: [] as Entry[], currentId: null as string | null, ready: false });

let LAST = 'metronome.last';
/** Scope remembered state to the signed-in account. */
export const useUser = (uid: string) => { LAST = `metronome.last.${uid}`; };
export const lastId = () => { try { return localStorage.getItem(LAST); } catch { return null; } };
export const rememberLast = (id: string | null) => { try { id ? localStorage.setItem(LAST, id) : localStorage.removeItem(LAST); } catch { /* not remembered */ } };

const byRecent = () => lib.entries.sort((a, b) => b.updated - a.updated);

export async function init() {
  lib.entries = await all<Entry>('pieces');
  byRecent();
  lib.ready = true;
}

export const entry = (id: string | null) => lib.entries.find((e) => e.id === id);

export async function create(title: string, pdf?: Blob, piece: Piece = emptyPiece()): Promise<string> {
  const e: Entry = { id: crypto.randomUUID(), title, updated: Date.now(), hasPdf: !!pdf, piece };
  lib.entries.push(e);
  await put('pieces', e.id, $state.snapshot(e));
  if (pdf) await put('pdfs', e.id, pdf);
  byRecent();
  return e.id;
}

export const loadPdf = (id: string) => get<Blob>('pdfs', id);

export async function attachPdf(id: string, pdf: Blob) {
  const e = entry(id);
  if (!e) return;
  e.hasPdf = true;
  await put('pdfs', id, pdf);
  await put('pieces', id, $state.snapshot(e));
}

/** Persist the markup of the open piece. */
export async function saveCurrent(piece: Piece) {
  const e = entry(lib.currentId);
  if (!e) return;
  e.piece = $state.snapshot(piece) as Piece;
  e.updated = Date.now();
  await put('pieces', e.id, $state.snapshot(e));
}

export async function rename(id: string, title: string) {
  const e = entry(id);
  if (!e || !title.trim()) return;
  e.title = title.trim();
  await put('pieces', id, $state.snapshot(e));
}

export async function remove(id: string) {
  lib.entries = lib.entries.filter((e) => e.id !== id);
  await del('pieces', id);
  await del('pdfs', id);
  if (lib.currentId === id) { lib.currentId = null; rememberLast(null); }
}
