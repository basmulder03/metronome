import type { Piece } from '../../shared/types';
import { validatePiece } from '../share/validate';

const MAX_PIECES = 500;

/** Every piece's markup (never a PDF) as one file, to move a library from a test server to the real one. */
export function exportBackup(entries: { title: string; piece: Piece }[]): string {
  return JSON.stringify({ app: 'metronome-backup', v: 1, pieces: entries.filter((e) => e.piece.measures.length).map((e) => ({ title: e.title, piece: e.piece })) });
}

/** Pieces from a backup file, each rebuilt through the same validation as share links. Null if it is not a backup. */
export function parseBackup(text: string): { title: string; piece: Piece }[] | null {
  try {
    const x = JSON.parse(text);
    if (x?.app !== 'metronome-backup' || x.v !== 1 || !Array.isArray(x.pieces) || x.pieces.length > MAX_PIECES) return null;
    const out: { title: string; piece: Piece }[] = [];
    for (const p of x.pieces) {
      const piece = validatePiece(p?.piece);
      if (piece && typeof p.title === 'string') out.push({ title: p.title.slice(0, 120) || 'Untitled', piece });
    }
    return out;
  } catch {
    return null;
  }
}
