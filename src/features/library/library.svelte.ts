import { notifyChange } from '../../shared/changes';
import { all, del, get, put } from '../../shared/idb';
import { addTombstone, clearTombstone } from '../../shared/tombstones';
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
  notifyChange();
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

/** Persist the markup of the open piece. Only a real change bumps `updated`, or opening a piece would beat newer edits from another device. */
export async function saveCurrent(piece: Piece) {
  const e = entry(lib.currentId);
  if (!e) return;
  const next = $state.snapshot(piece) as Piece;
  if (JSON.stringify(next) === JSON.stringify($state.snapshot(e.piece))) return;
  e.piece = next;
  e.updated = Date.now();
  await put('pieces', e.id, $state.snapshot(e));
  notifyChange();
}

/** Create or overwrite a piece with what the server has. Keeps the server's timestamp so the next sync sees no difference. */
export async function applyRemote(id: string, title: string, piece: Piece, updated: number) {
  const e = entry(id);
  if (e) { e.title = title; e.piece = piece; e.updated = updated; }
  else lib.entries.push({ id, title, piece, updated, hasPdf: false });
  await put('pieces', id, $state.snapshot(entry(id)));
  await clearTombstone('pieces', id);
  byRecent();
}

/** The piece was deleted on another device: drop it (and its PDF) here without creating a tombstone. */
export async function dropLocal(id: string) {
  lib.entries = lib.entries.filter((e) => e.id !== id);
  await del('pieces', id);
  await del('pdfs', id);
  if (lib.currentId === id) { lib.currentId = null; rememberLast(null); }
}

export async function rename(id: string, title: string) {
  const e = entry(id);
  if (!e || !title.trim()) return;
  e.title = title.trim();
  e.updated = Date.now();
  await put('pieces', id, $state.snapshot(e));
  notifyChange();
}

export async function remove(id: string) {
  lib.entries = lib.entries.filter((e) => e.id !== id);
  await del('pieces', id);
  await del('pdfs', id);
  await addTombstone('pieces', id);
  if (lib.currentId === id) { lib.currentId = null; rememberLast(null); }
  notifyChange();
}
