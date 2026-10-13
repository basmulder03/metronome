import { emptyPiece } from './types';
import { buildTimeline } from '../features/tempo-map/timeline';
import { sound } from '../features/playback/sound.svelte';

export const app = $state({
  piece: emptyPiece(),
  selected: -1,
  extent: -1, // last measure of a selected run (Shift+click), or -1 when only `selected` is picked
  playing: -1, // measure being played, -1 when stopped
});

/** The piece's timeline at the speed chosen in the playback bar (or `percent`). */
export const timeline = (percent = sound.speed) => buildTimeline(app.piece, percent / 100);

/** The selected run of measures [first, last], or null for a single measure. */
export const selectedRange = (): [number, number] | null =>
  app.selected >= 0 && app.extent > app.selected && app.extent < app.piece.measures.length ? [app.selected, app.extent] : null;

/** Pick a measure; with `extend` (Shift) the run from the selected measure to it is selected instead. */
export function choose(i: number, extend = false) {
  if (extend && app.selected >= 0 && i !== app.selected) {
    const end = Math.max(app.extent, app.selected);
    if (i < app.selected) { app.extent = end; app.selected = i; } else app.extent = i;
  } else {
    app.selected = i;
    app.extent = -1;
  }
}
