import { describe, expect, it } from 'vitest';
import { reconcile, type Rec } from './reconcile';

const rec = (id: string, updated: number, deleted = false): Rec => ({ id, updated, ...(deleted && { deleted }) });
const empty = { pull: [], dropLocal: [], push: [], pushDelete: [] };

describe('reconcile', () => {
  it('does nothing when both sides agree', () => expect(reconcile([rec('a', 5)], [rec('a', 5)])).toEqual(empty));

  it('pulls what only the server has, pushes what only this device has', () => {
    expect(reconcile([rec('mine', 1)], [rec('theirs', 1)])).toEqual({ ...empty, pull: ['theirs'], push: ['mine'] });
  });

  it('newer side wins', () => {
    expect(reconcile([rec('a', 1), rec('b', 9)], [rec('a', 5), rec('b', 2)])).toEqual({ ...empty, pull: ['a'], push: ['b'] });
  });

  it('a deletion elsewhere removes the local copy if it is newer than the last local edit', () => {
    expect(reconcile([rec('a', 1)], [rec('a', 5, true)])).toEqual({ ...empty, dropLocal: ['a'] });
  });

  it('an edit made after the remote deletion brings the piece back', () => {
    expect(reconcile([rec('a', 9)], [rec('a', 5, true)])).toEqual({ ...empty, push: ['a'] });
  });

  it('a local deletion is pushed when newer, and a newer remote edit undoes it', () => {
    expect(reconcile([rec('a', 9, true)], [rec('a', 5)])).toEqual({ ...empty, pushDelete: ['a'] });
    expect(reconcile([rec('a', 5, true)], [rec('a', 9)])).toEqual({ ...empty, pull: ['a'] });
  });

  it('never resurrects things that are deleted on the other side only', () => {
    expect(reconcile([], [rec('gone', 5, true)])).toEqual(empty);
    expect(reconcile([rec('gone', 5, true)], [])).toEqual(empty);
    expect(reconcile([rec('a', 5, true)], [rec('a', 6, true)])).toEqual(empty);
  });

  it('is idempotent: after applying the actions the next run is a no-op', () => {
    const local = [rec('a', 1), rec('b', 9), rec('c', 3, true)];
    const remote = [rec('a', 5), rec('b', 2), rec('c', 1), rec('d', 4)];
    const act = reconcile(local, remote);
    const t = new Map<string, Rec>();
    for (const x of local) t.set(x.id, x);
    const rmap = new Map(remote.map((x) => [x.id, { ...x }]));
    for (const id of act.pull) t.set(id, { ...rmap.get(id)! });
    for (const id of act.dropLocal) t.set(id, { ...rmap.get(id)! });
    for (const id of [...act.push, ...act.pushDelete]) rmap.set(id, { ...t.get(id)! });
    expect(reconcile([...t.values()], [...rmap.values()])).toEqual(empty);
  });
});
