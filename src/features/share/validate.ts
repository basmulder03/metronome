import type { Marks, Piece } from '../../shared/types';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const int = (v: unknown, min: number, max: number): v is number => num(v, min, max) && Number.isInteger(v);
const DENS = [1, 2, 4, 8, 16, 32, 64];
const MAX_MEASURES = 2000;
const MAX_SECTIONS = 50;

function marks(v: unknown): Marks | undefined {
  if (!isObj(v)) return undefined;
  const out: Marks = {};
  for (const k of ['repeatStart', 'segno', 'coda', 'fine', 'toCoda'] as const) if (v[k] === true) out[k] = true;
  if (int(v.repeatEnd, 2, 16)) out.repeatEnd = v.repeatEnd;
  if (Array.isArray(v.volta) && v.volta.length <= 4 && v.volta.every((n) => int(n, 1, 8))) out.volta = v.volta as number[];
  if (v.jump === 'dc' || v.jump === 'ds') out.jump = v.jump;
  if (isObj(v.part) && typeof v.part.name === 'string' && v.part.name.length <= 80) out.part = { name: v.part.name, ...(v.part.pause === true && { pause: true }), ...(v.part.restart === true && { restart: true }) };
  if (int(v.multirest, 2, 999)) out.multirest = v.multirest;
  if (int(v.pickup, 1, 64)) out.pickup = v.pickup;
  if (int(v.partial, 1, 64)) out.partial = v.partial;
  if (isObj(v.fermata) && int(v.fermata.beat, 0, 63) && num(v.fermata.factor, 1, 16)) out.fermata = { beat: v.fermata.beat, factor: v.fermata.factor };
  return Object.keys(out).length ? out : undefined;
}

/**
 * Rebuild a Piece from untrusted data (share links, imported files): anything unexpected is dropped or rejects the whole piece.
 * Fresh measure ids are generated, so imported data never chooses ids (unless `keepIds`, for the user's own synced data).
 */
export function validatePiece(x: unknown, { keepIds = false }: { keepIds?: boolean } = {}): Piece | null {
  if (!isObj(x) || !Array.isArray(x.measures) || x.measures.length === 0 || x.measures.length > MAX_MEASURES) return null;
  const n = x.measures.length;
  const piece: Piece = { measures: [], meters: [], tempos: [], ramps: [], countIn: int(x.countIn, 0, 4) ? x.countIn : 0, ...(x.afterPart === 'stop' && { afterPart: 'stop' as const }) };

  const used = new Set<string>();
  const ids = new Map<string, string>(); // the ids the data came with (a backup file has them) and the fresh ones
  for (const m of x.measures) {
    if (!isObj(m) || !int(m.page, 0, 9999) || !isObj(m.rect)) return null;
    const { x: rx, y: ry, w, h } = m.rect;
    if (!num(rx, 0, 1) || !num(ry, 0, 1) || !num(w, 0.0001, 1) || !num(h, 0.0001, 1)) return null;
    const mk = marks(m.marks);
    // `keepIds`: the data is the user's own (sync), so boxes keep their ids and edits from several people can be matched up
    const own = keepIds && typeof m.id === 'string' && /^[\w-]{1,64}$/.test(m.id) && !used.has(m.id) ? m.id : undefined;
    const id = own ?? crypto.randomUUID();
    used.add(id);
    if (typeof m.id === 'string') ids.set(m.id, id);
    piece.measures.push({ id, page: m.page, rect: { x: rx, y: ry, w, h }, ...(mk && { marks: mk }) });
  }

  for (const e of Array.isArray(x.meters) ? x.meters : []) {
    if (!isObj(e) || !int(e.at, 0, n - 1) || !isObj(e.meter)) return null;
    const { num: nn, den, grouping } = e.meter;
    if (!int(nn, 1, 64) || !DENS.includes(den as number) || !Array.isArray(grouping) || !grouping.every((g) => int(g, 1, 64)) || (grouping as number[]).reduce((a, b) => a + b, 0) !== nn) return null;
    piece.meters.push({ at: e.at, meter: { num: nn, den: den as number, grouping: grouping as number[] } });
  }

  for (const e of Array.isArray(x.tempos) ? x.tempos : []) {
    if (!isObj(e) || !int(e.at, 0, n - 1) || !num(e.bpm, 10, 1000) || !isObj(e.unit) || !DENS.includes(e.unit.den as number) || typeof e.unit.dotted !== 'boolean') return null;
    piece.tempos.push({ at: e.at, bpm: e.bpm, unit: { den: e.unit.den as number, dotted: e.unit.dotted } });
  }

  for (const r of Array.isArray(x.ramps) ? x.ramps : []) {
    if (!isObj(r) || !int(r.from, 0, n - 1) || !int(r.to, 0, n - 1) || r.to < r.from || !num(r.startBpm, 10, 1000) || !num(r.endBpm, 10, 1000)) return null;
    const c = r.curve;
    if (!Array.isArray(c) || c.length !== 4 || !num(c[0], 0, 1) || !num(c[2], 0, 1) || !num(c[1], -2, 3) || !num(c[3], -2, 3)) return null;
    piece.ramps.push({ from: r.from, to: r.to, startBpm: r.startBpm, endBpm: r.endBpm, curve: [c[0], c[1], c[2], c[3]] });
  }

  // saved practice sections: `from`/`to` are positions (a share link) or the ids the pieces came with (a backup file)
  const ref = (v: unknown) => (int(v, 0, n - 1) ? piece.measures[v].id : typeof v === 'string' ? ids.get(v) : undefined);
  for (const sec of (Array.isArray(x.sections) ? x.sections : []).slice(0, MAX_SECTIONS)) {
    if (!isObj(sec) || typeof sec.name !== 'string' || !sec.name.trim() || sec.name.length > 80) continue;
    const from = ref(sec.from), to = ref(sec.to);
    if (from && to) (piece.sections ??= []).push({ name: sec.name, from, to });
  }
  return piece;
}
