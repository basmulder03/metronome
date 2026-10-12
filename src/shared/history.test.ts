import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHistory } from './history';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const settle = () => vi.advanceTimersByTime(600);

describe('history', () => {
  it('undoes and redoes one change at a time', () => {
    const h = createHistory('a');
    h.note('b'); settle(); h.note('c'); settle();
    expect(h.undo()).toBe('b');
    expect(h.undo()).toBe('a');
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe('b');
    expect(h.redo()).toBe('c');
    expect(h.redo()).toBeNull();
  });

  it('counts a quick burst of changes (dragging) as one step', () => {
    const h = createHistory('a');
    for (const s of ['b', 'c', 'd', 'e']) { h.note(s); vi.advanceTimersByTime(50); }
    settle();
    expect(h.undo()).toBe('a'); // straight back to before the drag
  });

  it('can undo before the burst has settled', () => {
    const h = createHistory('a');
    h.note('b'); // no waiting
    expect(h.canUndo).toBe(true);
    expect(h.undo()).toBe('a');
  });

  it('a new change after an undo drops the redo branch', () => {
    const h = createHistory('a');
    h.note('b'); settle();
    h.undo();
    h.note('x'); settle();
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBe('a');
  });

  it('ignores repeats of the current state, including the one an undo produces', () => {
    const h = createHistory('a');
    h.note('a');
    expect(h.canUndo).toBe(false);
    h.note('b'); settle();
    const back = h.undo()!;
    h.note(back); settle(); // the editor reporting the restored piece must not create a step
    expect(h.canRedo).toBe(true);
    expect(h.redo()).toBe('b');
  });

  it('keeps only the most recent steps', () => {
    const h = createHistory('0', { limit: 3 });
    for (let i = 1; i <= 6; i++) { h.note(String(i)); settle(); }
    const seen: string[] = [];
    for (let s = h.undo(); s !== null; s = h.undo()) seen.push(s);
    expect(seen).toEqual(['5', '4', '3']);
  });

  it('a checkpoint makes the next change a step of its own, even right after another', () => {
    const h = createHistory('a');
    h.note('b'); // e.g. auto-detect
    h.checkpoint(); // then Delete is pressed straight away
    h.note('c');
    expect(h.undo()).toBe('b'); // undoes the delete only
    expect(h.undo()).toBe('a');
  });

  it('reset forgets everything (a different piece was opened)', () => {
    const h = createHistory('a');
    h.note('b'); settle();
    h.reset('z');
    expect(h.canUndo).toBe(false);
    expect(h.undo()).toBeNull();
  });
});
