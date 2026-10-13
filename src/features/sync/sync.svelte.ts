import { ClientResponseError, type RecordModel } from 'pocketbase';
import { onLocalChange } from '../../shared/changes';
import { pb } from '../../shared/pb';
import { tombstones, type Kind } from '../../shared/tombstones';
import { auth, endSession } from '../auth/auth.svelte';
import { applyMerged, applyRemote, dropLocal, lib, markSynced } from '../library/library.svelte';
import { mergePieces, pick } from './merge';
import { applyRemotePlaylist, dropLocalPlaylist, pl, type Playlist } from '../playlist/playlist.svelte';
import { validatePiece } from '../share/validate';
import { reconcile, type Rec } from './reconcile';

export const sync = $state({ status: 'idle' as 'idle' | 'syncing' | 'offline' | 'error', last: 0 });

/** The app reacts when sync changes something it is showing (e.g. the open piece was edited on another device). */
export const hooks = {
  applied: (_kind: Kind, _id: string, _what: 'pulled' | 'dropped') => {},
  /** Called before each sync: write the open piece to the library, so edits typed a moment ago are part of what is merged. */
  flush: async () => {},
};

const isNetwork = (e: unknown) => e instanceof ClientResponseError && e.status === 0;

type Remote = { clientId: string; updatedAt: number; deleted?: boolean; owner?: string } & RecordModel;

/** Reconcile one collection. `locals` includes tombstones; `body` builds the server fields for a live item. */
async function syncKind<T extends { id: string }>(
  kind: Kind,
  locals: () => Promise<(Rec & { item?: T })[]>,
  body: (item: T) => Record<string, unknown>,
  pull: (r: Remote) => Promise<boolean>,
  drop: (id: string) => Promise<void>,
  pushed: (id: string) => Promise<void> = async () => {},
) {
  const col = pb.collection(kind);
  // list only what reconcile needs; the (bigger) markup is fetched below for the records that must be pulled
  const remote = await col.getFullList<Remote>({ batch: 200, fields: 'id,clientId,updatedAt,deleted,owner' });
  const byClient = new Map(remote.map((r) => [r.clientId, r]));
  const local = await locals();
  const act = reconcile(local, remote.map((r) => ({ id: r.clientId, updated: r.updatedAt ?? 0, deleted: !!r.deleted })));
  const item = new Map(local.map((l) => [l.id, l]));

  for (const id of act.pull) if (await pull(await col.getOne<Remote>(byClient.get(id)!.id))) hooks.applied(kind, id, 'pulled');
  // tell the app first: dropping clears the "open piece" it needs to recognise
  for (const id of act.dropLocal) { hooks.applied(kind, id, 'dropped'); await drop(id); }

  for (const id of act.push) {
    const l = item.get(id)!;
    const r = byClient.get(id);
    const mine = !r || !r.owner || r.owner === auth.user!.id; // a piece someone shared for editing is theirs: no `deleted` field for us to touch
    const data = { ...body(l.item!), clientId: id, updatedAt: l.updated, ...(mine && { deleted: false }) };
    if (r) await col.update(r.id, data); else await col.create({ ...data, owner: auth.user!.id });
    await pushed(id);
  }
  for (const id of act.pushDelete) {
    const r = byClient.get(id);
    if (r && r.owner && r.owner !== auth.user!.id) { await pb.send('/api/metronome/collab/remove', { method: 'POST', body: { record: r.id } }); continue; } // not ours to delete: just leave it
    if (r) await col.update(r.id, { deleted: true, updatedAt: item.get(id)!.updated, ...(kind === 'pieces' ? { markup: {} } : { items: [] }) });
  }
}

/**
 * A piece changed here and also on the server since the last sync (another device, or another person editing it with you):
 * merge the two edits instead of letting the newer save win and the other get lost.
 */
async function mergeConflicts() {
  const col = pb.collection('pieces');
  const remote = await col.getFullList<Remote>({ batch: 200, fields: 'id,clientId,updatedAt,deleted' });
  for (const e of [...lib.entries]) {
    const r = remote.find((x) => x.clientId === e.id);
    if (!r || r.deleted || !e.base || e.syncedAt === undefined) continue;
    if (e.updated === e.syncedAt || r.updatedAt === e.syncedAt || r.updatedAt === e.updated) continue; // only one side changed, or nothing did
    const full = await col.getOne<Remote>(r.id);
    const theirs = validatePiece(full.markup, { keepIds: true });
    if (!theirs) continue;
    const theirsWins = r.updatedAt > e.updated;
    const title = String(pick(e.baseTitle, e.title, String(full.title ?? '').slice(0, 200) || e.title, theirsWins) ?? e.title);
    const merged = mergePieces(e.base, JSON.parse(JSON.stringify(e.piece)), theirs, theirsWins);
    await applyMerged(e.id, title, merged, Math.max(Date.now(), r.updatedAt + 1));
    hooks.applied('pieces', e.id, 'pulled');
  }
}

async function once() {
  await hooks.flush();
  await mergeConflicts();
  const tPieces = await tombstones('pieces');
  await syncKind(
    'pieces',
    async () => [
      ...lib.entries.map((e) => ({ id: e.id, updated: e.updated, item: e })),
      ...Object.entries(tPieces).filter(([id]) => !lib.entries.some((e) => e.id === id)).map(([id, at]) => ({ id, updated: at, deleted: true })),
    ],
    (e) => ({ title: e.title, markup: JSON.parse(JSON.stringify(e.piece)) }),
    async (r) => {
      const piece = validatePiece(r.markup, { keepIds: true }); // server data is untrusted too (its ids are kept: they are what edits are matched by)
      if (!piece) return false;
      await applyRemote(r.clientId, String(r.title ?? '').slice(0, 200) || 'Untitled', piece, r.updatedAt);
      return true;
    },
    dropLocal,
    markSynced,
  );

  const tLists = await tombstones('playlists');
  await syncKind<Playlist>(
    'playlists',
    async () => [
      ...pl.lists.map((p) => ({ id: p.id, updated: p.updated ?? 0, item: p })),
      ...Object.entries(tLists).filter(([id]) => !pl.lists.some((p) => p.id === id)).map(([id, at]) => ({ id, updated: at, deleted: true })),
    ],
    (p) => ({ name: p.name, gap: p.gap, items: [...p.items] }),
    async (r) => {
      const items = Array.isArray(r.items) && r.items.length <= 500 && r.items.every((i: unknown) => typeof i === 'string') ? (r.items as string[]) : null;
      if (!items) return false;
      await applyRemotePlaylist({ id: r.clientId, name: String(r.name ?? '').slice(0, 200) || 'Playlist', gap: Math.min(60, Math.max(0, Number(r.gap) || 0)), items, updated: r.updatedAt });
      return true;
    },
    dropLocalPlaylist,
  );
}

let running: Promise<void> | null = null;
let again = false;

/** Sync now; calls made while a sync is running are folded into one more pass. */
export function syncNow(): Promise<void> {
  if (!auth.user) return Promise.resolve();
  if (running) { again = true; return running; }
  running = (async () => {
    sync.status = 'syncing';
    try {
      do { again = false; await once(); } while (again);
      sync.status = 'idle';
      sync.last = Date.now();
    } catch (e) {
      if (e instanceof ClientResponseError && e.status === 401) { endSession(); return; } // blocked or removed while signed in
      sync.status = isNetwork(e) ? 'offline' : 'error';
    } finally { running = null; }
  })();
  return running;
}

let timer = 0;
export const scheduleSync = (ms = 1500) => { clearTimeout(timer); timer = window.setTimeout(() => void syncNow(), ms); };

/** Start syncing for the signed-in account: now, on every local change, when back online, when the tab returns, and every minute. */
export function startSync() {
  void syncNow();
  const off = onLocalChange(() => scheduleSync());
  const wake = () => { if (document.visibilityState === 'visible') void syncNow(); };
  window.addEventListener('online', wake);
  document.addEventListener('visibilitychange', wake);
  const poll = window.setInterval(wake, 60_000);
  return () => { off(); window.removeEventListener('online', wake); document.removeEventListener('visibilitychange', wake); clearInterval(poll); clearTimeout(timer); };
}
