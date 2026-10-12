import type { Marks } from '../../shared/types';

/** How many bars a box stands for: 1, or N for a multi-measure rest. */
export const barsIn = (m: { marks?: Marks }) => (m.marks?.multirest && m.marks.multirest > 1 ? Math.floor(m.marks.multirest) : 1);

/**
 * The bar numbers as printed on the score, one label per box: "5", or "5–12" for a rest that stands for eight bars.
 * Boxes after a multi-measure rest skip ahead, exactly like the printed numbers do.
 */
export function barLabels(measures: { marks?: Marks }[]): string[] {
  let n = 1;
  return measures.map((m) => {
    if (m.marks?.part?.restart) n = 1;
    const bars = barsIn(m);
    const label = bars > 1 ? `${n}–${n + bars - 1}` : String(n);
    n += bars;
    return label;
  });
}

/** "Measure 5" or "Measures 5–12". */
export const barHeading = (label: string) => (label.includes('–') ? `Measures ${label}` : `Measure ${label}`);

/** The printed number of the first bar of a label ("5–12" is 5). */
export const firstBar = (label: string) => label.split('–')[0];
