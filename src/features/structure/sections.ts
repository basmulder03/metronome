import type { Piece, Section } from '../../shared/types';

/** The measure positions a saved section covers now, or null when one of its boxes is gone. */
export function sectionRange(p: Piece, s: Section): [number, number] | null {
  const a = p.measures.findIndex((m) => m.id === s.from), b = p.measures.findIndex((m) => m.id === s.to);
  return a < 0 || b < 0 ? null : [Math.min(a, b), Math.max(a, b)];
}

export function addSection(p: Piece, name: string, from: number, to: number) {
  const n = name.trim().slice(0, 80);
  if (!n || !p.measures[from] || !p.measures[to]) return;
  p.sections = [...(p.sections ?? []), { name: n, from: p.measures[from].id, to: p.measures[to].id }].slice(-50); // (one assignment: the app's state notices it)
}

export function removeSection(p: Piece, index: number) {
  const rest = (p.sections ?? []).filter((_, i) => i !== index);
  if (rest.length) p.sections = rest; else delete p.sections;
}
