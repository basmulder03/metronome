import { emptyPiece } from './types';
import { buildTimeline } from '../features/tempo-map/timeline';

export const app = $state({
  piece: emptyPiece(),
  selected: -1,
  playing: -1, // measure being played, -1 when stopped
});

export const timeline = () => buildTimeline(app.piece);
