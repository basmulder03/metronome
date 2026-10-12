import { describe, expect, it } from 'vitest';
import { actionFor, SHORTCUTS, type KeyInfo } from './shortcuts';

const key = (k: string, mods: Partial<KeyInfo> = {}): KeyInfo => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
const free = { typing: false, modal: false, onButton: false };

describe('actionFor', () => {
  it('maps the editing keys', () => {
    expect(actionFor(key('Delete'), free)).toEqual({ type: 'delete' });
    expect(actionFor(key('Backspace'), free)).toEqual({ type: 'delete' });
    expect(actionFor(key('ArrowRight'), free)).toEqual({ type: 'select', delta: 1 });
    expect(actionFor(key('ArrowLeft'), free)).toEqual({ type: 'select', delta: -1 });
    expect(actionFor(key('m'), free)).toEqual({ type: 'merge' });
    expect(actionFor(key('M', { shiftKey: true }), free)).toEqual({ type: 'merge' }); // caps lock or shift does not matter
    expect(actionFor(key('d'), free)).toEqual({ type: 'mode', mode: 'draw' });
    expect(actionFor(key('s'), free)).toEqual({ type: 'mode', mode: 'split' });
    expect(actionFor(key('v'), free)).toEqual({ type: 'mode', mode: 'select' });
    expect(actionFor(key(' '), free)).toEqual({ type: 'play' });
    expect(actionFor(key('Escape'), free)).toEqual({ type: 'escape' });
    expect(actionFor(key('F2'), free)).toEqual({ type: 'rename' });
    expect(actionFor(key('?', { shiftKey: true }), free)).toEqual({ type: 'help' });
  });

  it('Alt moves a box and Alt+Shift resizes it', () => {
    expect(actionFor(key('ArrowLeft', { altKey: true }), free)).toEqual({ type: 'nudge', dx: -0.002, dy: 0 });
    expect(actionFor(key('ArrowDown', { altKey: true }), free)).toEqual({ type: 'nudge', dx: 0, dy: 0.002 });
    expect(actionFor(key('ArrowRight', { altKey: true, shiftKey: true }), free)).toEqual({ type: 'resize', dw: 0.002, dh: 0 });
    expect(actionFor(key('ArrowUp', { altKey: true, shiftKey: true }), free)).toEqual({ type: 'resize', dw: 0, dh: -0.002 });
  });

  it('comma and period move the barline, bigger with Shift', () => {
    expect(actionFor(key(','), free)).toEqual({ type: 'bar', dx: -0.002 });
    expect(actionFor(key('.'), free)).toEqual({ type: 'bar', dx: 0.002 });
    expect(actionFor(key('<', { shiftKey: true }), free)).toEqual({ type: 'bar', dx: -0.01 });
    expect(actionFor(key('>', { shiftKey: true }), free)).toEqual({ type: 'bar', dx: 0.01 });
  });

  it('undo and redo, with Ctrl or Cmd', () => {
    expect(actionFor(key('z', { ctrlKey: true }), free)).toEqual({ type: 'undo' });
    expect(actionFor(key('z', { metaKey: true }), free)).toEqual({ type: 'undo' });
    expect(actionFor(key('Z', { ctrlKey: true, shiftKey: true }), free)).toEqual({ type: 'redo' });
    expect(actionFor(key('y', { ctrlKey: true }), free)).toEqual({ type: 'redo' });
  });

  it('stays out of the way while typing in a field', () => {
    for (const k of ['Delete', 'Backspace', 'ArrowLeft', 'm', ' ', 'd', '?']) expect(actionFor(key(k), { ...free, typing: true }), k).toBeNull();
    expect(actionFor(key('z', { ctrlKey: true }), { ...free, typing: true })).toBeNull(); // the field's own undo
  });

  it('an open dialog gets every key, Escape included (the browser closes it)', () => {
    for (const k of [' ', 'Delete', 'ArrowLeft', 'd', 'm', 'Escape']) expect(actionFor(key(k), { ...free, modal: true }), k).toBeNull();
  });

  it('a focused button keeps Space, but the editing keys still work (a selected measure box is a button)', () => {
    expect(actionFor(key(' '), { ...free, onButton: true })).toBeNull();
    expect(actionFor(key('Delete'), { ...free, onButton: true })).toEqual({ type: 'delete' });
    expect(actionFor(key('ArrowRight'), { ...free, onButton: true })).toEqual({ type: 'select', delta: 1 });
  });

  it('ignores other combinations and browser shortcuts', () => {
    expect(actionFor(key('d', { ctrlKey: true }), free)).toBeNull(); // Ctrl+D is the browser's
    expect(actionFor(key('s', { ctrlKey: true }), free)).toBeNull();
    expect(actionFor(key('x'), free)).toBeNull();
    expect(actionFor(key('Tab'), free)).toBeNull();
  });

  it('every documented shortcut is really mapped', () => {
    expect(SHORTCUTS.length).toBeGreaterThan(8);
    for (const s of SHORTCUTS) { expect(s.keys).toBeTruthy(); expect(s.does).toBeTruthy(); }
  });
});
