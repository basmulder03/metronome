import type { Marks, Measure, Piece, Section } from '../../shared/types';

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Three-way choice of one value: `base` is what both sides started from, `ours` and `theirs` what each has now.
 * If only one side changed it, that change wins. If both changed it differently, `theirsWins` decides (the newer edit).
 * `undefined` is a value too: it means "not there", so a removal is a change like any other.
 */
export function pick<T>(base: T | undefined, ours: T | undefined, theirs: T | undefined, theirsWins: boolean): T | undefined {
  if (same(ours, base)) return theirs;
  if (same(theirs, base) || same(ours, theirs)) return ours;
  return theirsWins ? theirs : ours;
}

function mergeMarks(b: Marks | undefined, o: Marks | undefined, t: Marks | undefined, theirsWins: boolean): Marks | undefined {
  const out: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(b ?? {}), ...Object.keys(o ?? {}), ...Object.keys(t ?? {})])) {
    const v = pick((b as Record<string, unknown> | undefined)?.[k], (o as Record<string, unknown> | undefined)?.[k], (t as Record<string, unknown> | undefined)?.[k], theirsWins);
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length ? (out as Marks) : undefined;
}

const byId = (p: Piece) => new Map(p.measures.map((m) => [m.id, m]));

/** Events that sit on a measure by position, keyed by the box they sit on, so that boxes added or removed elsewhere do not move them. */
function anchored<E extends { at: number }>(p: Piece, events: E[]): Map<string, Omit<E, 'at'>> {
  const out = new Map<string, Omit<E, 'at'>>();
  for (const { at, ...rest } of events) {
    const m = p.measures[at];
    if (m) out.set(m.id, rest as Omit<E, 'at'>);
  }
  return out;
}

function mergeAnchored<V>(b: Map<string, V>, o: Map<string, V>, t: Map<string, V>, theirsWins: boolean): Map<string, V> {
  const out = new Map<string, V>();
  for (const k of new Set([...b.keys(), ...o.keys(), ...t.keys()])) {
    const v = pick(b.get(k), o.get(k), t.get(k), theirsWins);
    if (v !== undefined) out.set(k, v);
  }
  return out;
}

/**
 * Merge two edits of the same piece that started from `base`. Boxes are matched by id, so a box added or removed by one side
 * never shifts what the other side did to its neighbours. A box removed by either side stays removed. Tempos, meters and
 * accel./rall. follow their box; per box, each mark is merged on its own (one person's fermata and another's repeat both stay).
 * When both sides changed the very same thing, `theirsWins` picks (pass true when theirs is the newer save).
 */
export function mergePieces(base: Piece, ours: Piece, theirs: Piece, theirsWins: boolean): Piece {
  const B = byId(base), O = byId(ours), T = byId(theirs);
  const alive = (id: string) => !(B.has(id) && (!O.has(id) || !T.has(id))); // removed by either side: gone

  // the boxes: our order, with the boxes only they have slipped in after the box that precedes them on their side
  const order = ours.measures.map((m) => m.id).filter(alive);
  const placed = new Set(order);
  let prev: string | undefined;
  for (const m of theirs.measures) {
    if (!alive(m.id)) continue;
    if (!placed.has(m.id)) {
      order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, m.id);
      placed.add(m.id);
    }
    prev = m.id;
  }

  const measures: Measure[] = order.map((id) => {
    const b = B.get(id), o = O.get(id), t = T.get(id);
    if (!o || !t) return structuredClone(o ?? t!); // added on one side only
    const marks = mergeMarks(b?.marks, o.marks, t.marks, theirsWins);
    return {
      id,
      page: pick(b?.page, o.page, t.page, theirsWins)!,
      rect: pick(b?.rect, o.rect, t.rect, theirsWins)!,
      ...(marks && { marks }),
    };
  });
  const at = new Map(measures.map((m, i) => [m.id, i]));

  const place = <V>(m: Map<string, V>) => [...m].filter(([id]) => at.has(id)).map(([id, v]) => ({ at: at.get(id)!, ...v })).sort((a, b) => a.at - b.at);

  const meters = place(mergeAnchored(anchored(base, base.meters), anchored(ours, ours.meters), anchored(theirs, theirs.meters), theirsWins));
  const tempos = place(mergeAnchored(anchored(base, base.tempos), anchored(ours, ours.tempos), anchored(theirs, theirs.tempos), theirsWins));

  // a ramp runs from one box to another: both ends are boxes by id
  const ramps = (p: Piece) => new Map(p.ramps.flatMap((r) => (p.measures[r.from] && p.measures[r.to] ? [[p.measures[r.from].id, { to: p.measures[r.to].id, startBpm: r.startBpm, endBpm: r.endBpm, curve: r.curve }] as const] : [])));
  const mergedRamps = [...mergeAnchored(ramps(base), ramps(ours), ramps(theirs), theirsWins)].flatMap(([from, r]) => {
    const a = at.get(from), z = at.get(r.to);
    return a === undefined || z === undefined || z < a ? [] : [{ from: a, to: z, startBpm: r.startBpm, endBpm: r.endBpm, curve: r.curve }];
  }).sort((a, b) => a.from - b.from);

  // saved sections: one stays unless either side removed it; each side's new ones are kept
  const sec = (p: Piece) => new Map((p.sections ?? []).map((s) => [JSON.stringify(s), s] as const));
  const sb = sec(base), so = sec(ours), st = sec(theirs);
  const sections: Section[] = [...new Set([...so.keys(), ...st.keys()])].filter((k) => (so.has(k) && st.has(k)) || (!sb.has(k) && (so.has(k) || st.has(k)))).map((k) => (so.get(k) ?? st.get(k))!);

  const countIn = pick(base.countIn, ours.countIn, theirs.countIn, theirsWins);
  const afterPart = pick(base.afterPart, ours.afterPart, theirs.afterPart, theirsWins);
  return {
    measures, meters, tempos, ramps: mergedRamps,
    countIn: countIn ?? 0,
    ...(afterPart && { afterPart }),
    ...(sections.length && { sections }),
  };
}
