/** A record's sync-relevant state: its id (the same on every device), when it last changed, and whether it was deleted. */
export type Rec = { id: string; updated: number; deleted?: boolean };

export type Actions = {
  /** Create or overwrite the local copy from the server. */
  pull: string[];
  /** Remove the local copy: it was deleted elsewhere. */
  dropLocal: string[];
  /** Create or overwrite the server copy from the local one. */
  push: string[];
  /** Mark the server copy deleted: it was deleted here. */
  pushDelete: string[];
};

/**
 * Last-write-wins per record. Deletions are records too (tombstones with a timestamp), so a delete on one device
 * beats an older edit on another instead of the item coming back.
 * shortcut: compares device clocks, so a badly wrong clock can win unfairly; upgrade to server-assigned versions if that bites.
 */
export function reconcile(local: Rec[], remote: Rec[]): Actions {
  const out: Actions = { pull: [], dropLocal: [], push: [], pushDelete: [] };
  const l = new Map(local.map((r) => [r.id, r]));
  const r = new Map(remote.map((x) => [x.id, x]));
  for (const id of new Set([...l.keys(), ...r.keys()])) {
    const a = l.get(id), b = r.get(id);
    if (!a && b) { if (!b.deleted) out.pull.push(id); continue; }
    if (a && !b) { if (!a.deleted) out.push.push(id); continue; }
    if (!a || !b || a.updated === b.updated) continue;
    if (b.updated > a.updated) { (b.deleted ? (a.deleted ? [] : out.dropLocal) : out.pull).push(id); }
    else (a.deleted ? out.pushDelete : out.push).push(id);
  }
  return out;
}
