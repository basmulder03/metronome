import { notifyChange } from '../../shared/changes';
import { all, del, put } from '../../shared/idb';
import { addTombstone, clearTombstone } from '../../shared/tombstones';

export type Playlist = { id: string; name: string; gap: number; items: string[]; updated?: number }; // items: library piece ids

export const pl = $state({ lists: [] as Playlist[] });

export async function initPlaylists() {
  pl.lists = (await all<Playlist>('playlists')).sort((a, b) => a.name.localeCompare(b.name));
}

const write = (p: Playlist) => put('playlists', p.id, $state.snapshot(p));

export async function createPlaylist(name: string) {
  const p: Playlist = { id: crypto.randomUUID(), name: name.trim() || 'Playlist', gap: 4, items: [], updated: Date.now() };
  pl.lists.push(p);
  await write(p);
  notifyChange();
  return p;
}

/** Persist an edit made to a playlist. */
export async function touch(p: Playlist) {
  p.updated = Date.now();
  await write(p);
  notifyChange();
}

export async function removePlaylist(id: string) {
  pl.lists = pl.lists.filter((p) => p.id !== id);
  await del('playlists', id);
  await addTombstone('playlists', id);
  notifyChange();
}

/** Create or overwrite a playlist with what the server has (keeping its timestamp). */
export async function applyRemotePlaylist(p: Playlist) {
  const i = pl.lists.findIndex((x) => x.id === p.id);
  if (i >= 0) pl.lists[i] = p; else pl.lists.push(p);
  await write(p);
  await clearTombstone('playlists', p.id);
}

/** Deleted on another device. */
export async function dropLocalPlaylist(id: string) {
  pl.lists = pl.lists.filter((p) => p.id !== id);
  await del('playlists', id);
}

/** Move item i by delta (-1 up, +1 down); no-op at the ends. */
export function move(p: Playlist, i: number, delta: number) {
  const j = i + delta;
  if (j < 0 || j >= p.items.length) return;
  [p.items[i], p.items[j]] = [p.items[j], p.items[i]];
}
