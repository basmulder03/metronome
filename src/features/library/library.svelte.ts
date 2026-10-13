import { notifyChange } from '../../shared/changes';
import { all, del, get, put } from '../../shared/idb';
import { addTombstone, clearTombstone } from '../../shared/tombstones';
import { emptyPiece, type Piece } from '../../shared/types';

/** `base`, `baseTitle`, `syncedAt`: what the piece looked like, and the server's timestamp, at the last sync: the starting point for merging edits made elsewhere. */
export type Entry = { id: string; title: string; updated: number; hasPdf: boolean; piece: Piece; base?: Piece; baseTitle?: string; syncedAt?: number };

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
  const base = structuredClone($state.snapshot(piece)) as Piece;
  if (e) { e.title = title; e.piece = piece; e.updated = updated; e.base = base; e.baseTitle = title; e.syncedAt = updated; }
  else lib.entries.push({ id, title, piece, updated, hasPdf: false, base, baseTitle: title, syncedAt: updated });
  await put('pieces', id, $state.snapshot(entry(id)));
  await clearTombstone('pieces', id);
  byRecent();
}

/** The server now has what this device has: remember it as the starting point for the next merge. */
export async function markSynced(id: string) {
  const e = entry(id);
  if (!e) return;
  e.base = structuredClone($state.snapshot(e.piece)) as Piece;
  e.baseTitle = e.title;
  e.syncedAt = e.updated;
  await put('pieces', id, $state.snapshot(e));
}

/** Another editor changed the piece while this device did too: keep the merged result (it is newer than both, so it is pushed next). */
export async function applyMerged(id: string, title: string, piece: Piece, updated: number) {
  const e = entry(id);
  if (!e) return;
  e.title = title; e.piece = piece; e.updated = updated;
  await put('pieces', id, $state.snapshot(e));
}

/** The piece was deleted on another device: drop it (and its PDF) here without creating a tombstone. */
export async function dropLocal(id: string) {
  lib.entries = lib.entries.filter((e) => e.id !== id);
  await del('pieces', id);
  await del('pdfs', id);
  if (lib.currentId === id) { lib.currentId = null; rememberLast(null); }
}

/** A copy of a piece's markup under a new name, without the PDF: the same click track can then be attached to another part's PDF. */
export async function duplicate(id: string): Promise<string | undefined> {
  const e = entry(id);
  if (!e) return undefined;
  return create(`${e.title} (copy)`, undefined, structuredClone($state.snapshot(e.piece)) as Piece);
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
