import { get, put } from './idb';

export type Kind = 'pieces' | 'playlists';
type Marks = Record<string, number>; // id -> when it was deleted here

/** Deletions made on this device, kept so sync can tell other devices (and not resurrect the item). */
export const tombstones = async (kind: Kind): Promise<Marks> => (await get<Marks>('meta', `tombstones:${kind}`)) ?? {};

export async function addTombstone(kind: Kind, id: string, at = Date.now()) {
  await put('meta', `tombstones:${kind}`, { ...(await tombstones(kind)), [id]: at });
}

/** An item was recreated or restored: its tombstone no longer applies. */
export async function clearTombstone(kind: Kind, id: string) {
  const t = await tombstones(kind);
  if (id in t) { delete t[id]; await put('meta', `tombstones:${kind}`, t); }
}
