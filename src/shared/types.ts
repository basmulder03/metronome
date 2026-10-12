/** Normalised (0..1) rectangle on a PDF page, so markup survives zoom and resize. */
export type Rect = { x: number; y: number; w: number; h: number };

/** Cubic-bezier easing, CSS-style: control points (x1,y1) and (x2,y2). */
export type Curve = [x1: number, y1: number, x2: number, y2: number];

/** Playing order == array order. Repeats/jumps come in a later phase. */
export type Measure = { id: string; page: number; rect: Rect };

/** `grouping` is in 1/den units and sums to num: 7/8 = [2,2,3]; 4/4 = [1,1,1,1]. */
export type Meter = { num: number; den: number; grouping: number[] };

/** The note value `bpm` is counted in, e.g. dotted quarter for 6/8. */
export type Unit = { den: number; dotted: boolean };

export type MeterEvent = { at: number; meter: Meter };
export type TempoEvent = { at: number; bpm: number; unit: Unit };
/** Tempo moves from startBpm to endBpm across measures from..to (inclusive) along `curve`. */
export type Ramp = { from: number; to: number; startBpm: number; endBpm: number; curve: Curve };

export type Piece = {
  measures: Measure[];
  meters: MeterEvent[];
  tempos: TempoEvent[];
  ramps: Ramp[];
};

export const emptyPiece = (): Piece => ({ measures: [], meters: [], tempos: [], ramps: [] });

export const DEFAULT_METER: Meter = { num: 4, den: 4, grouping: [1, 1, 1, 1] };
export const DEFAULT_UNIT: Unit = { den: 4, dotted: false };
export const DEFAULT_BPM = 100;
