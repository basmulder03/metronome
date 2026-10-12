import { emptyPiece, type Piece } from './types';
import { buildTimeline } from '../features/tempo-map/timeline';

const KEY = 'metronome.piece';

function load(): Piece {
  try { return { ...emptyPiece(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return emptyPiece(); }
}

export const app = $state({
  piece: load(),
  selected: -1,
  playing: -1, // measure being played, -1 when stopped
});

export const timeline = () => buildTimeline(app.piece);

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(app.piece)); } catch { /* private mode: markup just isn't remembered */ }
}
