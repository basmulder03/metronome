export type Action =
  | { type: 'delete' }
  | { type: 'select'; delta: -1 | 1 }
  | { type: 'nudge'; dx: number; dy: number }
  | { type: 'resize'; dw: number; dh: number }
  | { type: 'bar'; dx: number }
  | { type: 'mode'; mode: 'draw' | 'split' | 'select' }
  | { type: 'merge' }
  | { type: 'play' }
  | { type: 'escape' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'rename' }
  | { type: 'help' };

export type KeyInfo = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

/** Step of a nudge, in fractions of the page: fine by default, coarse with Shift (barline) or Ctrl/Cmd. */
const FINE = 0.002;
const COARSE = 0.01;

/**
 * What a key press means, or null. `typing`: a text field has focus (it keeps its keys). `modal`: a dialog is open (it keeps
 * every key). `onButton`: a button has focus, which owns Space. A selected measure box is a button, so Delete and the arrows still work.
 */
export function actionFor(k: KeyInfo, { typing, modal, onButton }: { typing: boolean; modal: boolean; onButton: boolean }): Action | null {
  const mod = k.ctrlKey || k.metaKey;
  const key = k.key.length === 1 ? k.key.toLowerCase() : k.key;

  if (typing) return null; // a text field keeps its own keys, including its own undo
  if (mod && !k.altKey) {
    if (key === 'z') return k.shiftKey ? { type: 'redo' } : { type: 'undo' };
    if (key === 'y') return { type: 'redo' };
    return null;
  }
  if (modal) return null; // a dialog gets every key, Escape included: the browser closes it
  if (onButton && key === ' ') return null;

  if (k.altKey && !mod) {
    const step = FINE;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[key as 'ArrowLeft'];
    if (d) return k.shiftKey ? { type: 'resize', dw: d[0], dh: d[1] } : { type: 'nudge', dx: d[0], dy: d[1] };
    return null;
  }
  switch (key) {
    case 'Delete':
    case 'Backspace': return { type: 'delete' };
    case 'ArrowLeft': return { type: 'select', delta: -1 };
    case 'ArrowRight': return { type: 'select', delta: 1 };
    case ',': return { type: 'bar', dx: -(k.shiftKey ? COARSE : FINE) };
    case '<': return { type: 'bar', dx: -COARSE };
    case '.': return { type: 'bar', dx: k.shiftKey ? COARSE : FINE };
    case '>': return { type: 'bar', dx: COARSE };
    case 'd': return { type: 'mode', mode: 'draw' };
    case 's': return { type: 'mode', mode: 'split' };
    case 'v': return { type: 'mode', mode: 'select' };
    case 'm': return { type: 'merge' };
    case 'F2': return { type: 'rename' };
    case ' ': return { type: 'play' };
    case 'Escape': return { type: 'escape' };
    case '?': return { type: 'help' };
  }
  return null;
}

/** Every shortcut, for the help dialog. */
export const SHORTCUTS: { keys: string; does: string }[] = [
  { keys: '← →', does: 'Select the previous or next measure' },
  { keys: 'Delete or Backspace', does: 'Delete the selected measure box' },
  { keys: 'Alt + arrows', does: 'Move the selected box' },
  { keys: 'Alt + Shift + arrows', does: 'Resize the selected box (right and bottom edges)' },
  { keys: ', and .', does: 'Move the barline after the selected measure left or right (hold Shift for bigger steps)' },
  { keys: 'M', does: 'Merge the selected measure with the next one' },
  { keys: 'D, S, V', does: 'Draw, Split or Select mode' },
  { keys: 'Space', does: 'Play from the selected measure, or stop' },
  { keys: 'Escape', does: 'Stop playing, or deselect' },
  { keys: 'Ctrl+Z, Ctrl+Shift+Z', does: 'Undo, redo' },
  { keys: 'F2', does: 'Rename this piece' },
  { keys: '?', does: 'Show this list' },
];
