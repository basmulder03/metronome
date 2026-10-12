import type { Marks } from '../../shared/types';

export type Part = { index: number; name: string; start: number; end: number; pause: boolean };

/**
 * The parts of a sheet that holds several (movements, sections), from the measures marked "starts a new part".
 * Empty when nothing is marked: then the piece is one thing. The first part begins at measure 0 even if that is not marked.
 */
export function partsOf(measures: { marks?: Marks }[]): Part[] {
  const starts = measures.flatMap((m, i) => (m.marks?.part ? [i] : []));
  if (!starts.length) return [];
  if (starts[0] !== 0) starts.unshift(0);
  return starts.map((start, k) => ({
    index: k,
    name: measures[start].marks?.part?.name?.trim() || `Part ${k + 1}`,
    start,
    end: (starts[k + 1] ?? measures.length) - 1,
    pause: !!measures[start].marks?.part?.pause,
  }));
}

/** The name a part would get if it started at `index`: its position among the parts, counting the unmarked first one. */
export function defaultPartName(measures: { marks?: Marks }[], index: number): string {
  const starts = new Set(measures.flatMap((m, i) => (m.marks?.part ? [i] : [])));
  starts.add(0);
  starts.add(index);
  return `Part ${[...starts].sort((a, b) => a - b).indexOf(index) + 1}`;
}

/** Which part a written measure belongs to, or -1. */
export const partIndexOf = (parts: Part[], measure: number) => parts.findIndex((p) => measure >= p.start && measure <= p.end);
