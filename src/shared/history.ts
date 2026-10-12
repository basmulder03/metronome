/**
 * Undo and redo over snapshots of a piece (as JSON). Changes that arrive within `burstMs` of each other count as one step,
 * so dragging a box for a second is a single undo, not a hundred.
 */
export function createHistory(initial: string, { limit = 100, burstMs = 500 } = {}) {
  let current = initial;
  let base: string | null = null; // the state before the burst that is in progress
  let timer: ReturnType<typeof setTimeout> | undefined;
  let past: string[] = [];
  let future: string[] = [];

  const commit = () => {
    clearTimeout(timer);
    if (base !== null && base !== current) {
      past.push(base);
      if (past.length > limit) past.shift();
      future = [];
    }
    base = null;
  };

  return {
    /** Tell it the piece is now `json`. Repeats and restores of its own are ignored. */
    note(json: string) {
      if (json === current) return;
      base ??= current;
      current = json;
      clearTimeout(timer);
      timer = setTimeout(commit, burstMs);
    },
    undo(): string | null {
      commit();
      const prev = past.pop();
      if (prev === undefined) return null;
      future.push(current);
      current = prev;
      return prev;
    },
    redo(): string | null {
      commit();
      const next = future.pop();
      if (next === undefined) return null;
      past.push(current);
      current = next;
      return next;
    },
    /** Close the burst in progress, so the next change starts a step of its own (delete, merge, detect: each should undo alone). */
    checkpoint() { commit(); },
    /** A different piece was opened: forget everything. */
    reset(json: string) { clearTimeout(timer); current = json; base = null; past = []; future = []; },
    get canUndo() { return past.length > 0 || (base !== null && base !== current); },
    get canRedo() { return future.length > 0; },
  };
}
