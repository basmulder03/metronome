import { all, del, put } from '../../shared/idb';

export type Playlist = { id: string; name: string; gap: number; items: string[] }; // items: library piece ids

export const pl = $state({ lists: [] as Playlist[] });

export async function initPlaylists() {
  pl.lists = (await all<Playlist>('playlists')).sort((a, b) => a.name.localeCompare(b.name));
}

const save = (p: Playlist) => put('playlists', p.id, $state.snapshot(p));

export async function createPlaylist(name: string) {
  const p: Playlist = { id: crypto.randomUUID(), name: name.trim() || 'Playlist', gap: 4, items: [] };
  pl.lists.push(p);
  await save(p);
  return p;
}

export const touch = (p: Playlist) => save(p);

export async function removePlaylist(id: string) {
  pl.lists = pl.lists.filter((p) => p.id !== id);
  await del('playlists', id);
}

/** Move item i by delta (-1 up, +1 down); no-op at the ends. */
export function move(p: Playlist, i: number, delta: number) {
  const j = i + delta;
  if (j < 0 || j >= p.items.length) return;
  [p.items[i], p.items[j]] = [p.items[j], p.items[i]];
}
