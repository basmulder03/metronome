<script lang="ts">
  import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
  import type { Measure, Rect } from '../../shared/types';
  import { app } from '../../shared/store.svelte';
  import { barLabels } from '../structure/bars';
  import { boxLabel, inRamp as rampOf } from './labels';
  import { dragEdge, insertMeasures, moveBox, outlineRect, snapBox, splitMeasure, type Edge } from './markup';

  // `onstep` is called just before a gesture edits the boxes, so each drag, drawn box or split is its own undo step
  // `snap`: new and dragged boxes line up with their neighbours (hold Alt to skip it for one gesture)
  let { doc, pageNum, zoom, mode, onstep = () => {}, snap = true }: { doc: PDFDocumentProxy | null; pageNum: number; zoom: number; mode: 'draw' | 'split' | 'select'; onstep?: () => void; snap?: boolean } = $props();

  let canvas: HTMLCanvasElement;
  let renderedWidth = 0; // width the page was last drawn at (plain variable: reading it must not re-run the render)
  let resizeTick = $state(0);

  /**
   * Pixels of the current page for barline detection, rendered offscreen at a fixed width so the result does not depend on
   * the screen: on a phone the displayed page is so small that a scan's thin staff lines all but vanish.
   */
  export async function bitmap(width = 1400, pageIndex = pageNum) {
    if (!doc) throw new Error('no document');
    const page = await doc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
    const c = document.createElement('canvas');
    c.width = Math.ceil(viewport.width);
    c.height = Math.ceil(viewport.height);
    await page.render({ canvas: c, viewport }).promise;
    return c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
  }

  let overlay: HTMLDivElement;
  let aspect = $state(1.41);

  $effect(() => {
    canvas.removeAttribute('data-ready'); // synchronously: a switched piece must never look ready while the old page is shown
    if (!doc) return;
    let task: RenderTask | undefined;
    let dead = false;
    const width = zoom; // read here so the effect re-runs when zoom changes
    void resizeTick; // and when the window size changed enough to blur the bitmap
    void (async () => {
      const page = await doc.getPage(pageNum + 1);
      if (dead) return;
      const base = page.getViewport({ scale: 1 });
      aspect = base.height / base.width;
      // Render at the displayed pixel width (x devicePixelRatio) to keep memory small on phones.
      renderedWidth = overlay.clientWidth;
      const target = overlay.clientWidth * Math.min(window.devicePixelRatio, 2);
      const viewport = page.getViewport({ scale: target / base.width });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      task = page.render({ canvas, viewport });
      await task.promise.then(() => { if (!dead) canvas.dataset.ready = '1'; }, () => {}); // cancelled renders reject; data-ready marks a finished page (used by tests)
    })();
    return () => { dead = true; task?.cancel(); void width; };
  });

  // Rotating a phone or resizing the window only stretches the old bitmap: draw again once the size has settled.
  $effect(() => {
    let t = 0;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = window.setTimeout(() => { if (renderedWidth && Math.abs(overlay.clientWidth - renderedWidth) / renderedWidth > 0.1) resizeTick++; }, 200);
    });
    ro.observe(overlay);
    return () => { ro.disconnect(); clearTimeout(t); };
  });

  // Reading order: later page, lower system, or further right within the same system.
  const isAfter = (a: Measure, b: Measure) =>
    a.page !== b.page ? a.page > b.page
    : Math.abs(a.rect.y - b.rect.y) < b.rect.h / 2 ? a.rect.x > b.rect.x
    : a.rect.y > b.rect.y;

  function insertMeasure(m: Measure) {
    const ms = app.piece.measures;
    const at = ms.findIndex((x) => isAfter(x, m));
    const idx = at < 0 ? ms.length : at;
    insertMeasures(app.piece, idx, [m]);
    app.selected = idx;
  }

  const norm = (e: PointerEvent | MouseEvent) => {
    const r = overlay.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  let start: { x: number; y: number } | null = null;
  let ghost = $state<Rect | null>(null);
  const rectOf = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y),
  });

  function down(e: PointerEvent) {
    if (mode !== 'draw') return;
    start = norm(e);
    overlay.setPointerCapture(e.pointerId);
  }
  const move = (e: PointerEvent) => { if (start) ghost = rectOf(start, norm(e)); };
  function up(e: PointerEvent) {
    if (!start) return;
    const r = rectOf(start, norm(e));
    start = ghost = null;
    if (r.w > 0.02 && r.h > 0.01) {
      onstep();
      const others = app.piece.measures.filter((m) => m.page === pageNum).map((m) => m.rect);
      insertMeasure({ id: crypto.randomUUID(), page: pageNum, rect: snap && !e.altKey ? outlineRect(r, others) : r });
    }
  }

  // Dragging in Select mode: the body of a box moves it, the handles on a selected box move one edge. A barline shared with the
  // next box moves both, so dragging a bar resizes the two measures around it.
  type Drag = { kind: 'move' | Edge; i: number; x: number; y: number; moved: boolean };
  let drag: Drag | null = null;
  const EDGES: Edge[] = ['left', 'right', 'top', 'bottom'];

  function boxDown(e: PointerEvent, i: number) {
    if (mode !== 'select' || (e.target as HTMLElement).classList.contains('handle')) return;
    // not selected yet: a plain click selects on `click`, after a field being edited has lost focus (its change event must still find its box)
    drag = { kind: 'move', i, ...norm(e), moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function handleDown(e: PointerEvent, i: number, edge: Edge) {
    e.stopPropagation();
    e.preventDefault();
    app.selected = i;
    drag = { kind: edge, i, ...norm(e), moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function dragMove(e: PointerEvent) {
    if (!drag) return;
    const p = norm(e);
    const dx = p.x - drag.x, dy = p.y - drag.y;
    const r = overlay.getBoundingClientRect();
    if (!drag.moved && Math.hypot(dx * r.width, dy * r.height) < 3) return; // a click, not a drag
    if (!drag.moved) { onstep(); app.selected = drag.i; } // a real drag: now it is the selected box, and an undo step of its own
    drag.moved = true;
    if (drag.kind === 'move') moveBox(app.piece, drag.i, dx, dy);
    else dragEdge(app.piece, drag.i, drag.kind, drag.kind === 'left' || drag.kind === 'right' ? dx : dy);
    drag.x = p.x;
    drag.y = p.y;
  }
  function dragEnd(e: PointerEvent) {
    if (drag?.moved && snap && !e.altKey) snapBox(app.piece, drag.i); // settle onto the neighbours when the gesture ends
    drag = null;
  }

  function pick(e: MouseEvent, i: number) {
    if (mode === 'split') {
      onstep();
      if (splitMeasure(app.piece, i, norm(e).x, crypto.randomUUID())) app.selected = i;
    } else app.selected = i;
  }

  const here = $derived(app.piece.measures.map((m, i) => ({ m, i })).filter(({ m }) => m.page === pageNum));
  const bars = $derived(barLabels(app.piece.measures)); // printed bar numbers: a multi-measure rest skips ahead
  const label = (i: number) => boxLabel(app.piece, i);
  const inRamp = (i: number) => rampOf(app.piece, i);

  // On a phone the inspector is a bottom sheet over the lower part of the page: keep the box you picked above it.
  $effect(() => {
    if (app.selected < 0 || app.playing >= 0) return;
    queueMicrotask(() => {
      const el = overlay?.querySelector<HTMLElement>('.box.sel');
      if (!el || !matchMedia('(max-width: 899px)').matches) return;
      const r = el.getBoundingClientRect();
      if (r.bottom > innerHeight * 0.55 || r.top < 0) el.scrollIntoView({ block: 'center', behavior: 'auto' });
    });
  });

  // Follow playback: scroll the active box into view.
  $effect(() => {
    if (app.playing >= 0) overlay.querySelector('.box.playing')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
</script>

<div role="application" aria-label="Score" class="page" bind:this={overlay} style:--zoom={zoom} style:--aspect={1 / aspect}
  class:drawing={mode === 'draw'} onpointerdown={down} onpointermove={move} onpointerup={up}>
  <canvas bind:this={canvas}></canvas>
  {#each here as { m, i } (m.id)}
    <button type="button" class="box" class:sel={i === app.selected} class:playing={i === app.playing} class:ramp={inRamp(i)}
      style:--x={m.rect.x} style:--y={m.rect.y} style:--w={m.rect.w} style:--h={m.rect.h}
      onclick={(e) => pick(e, i)} onpointerdown={(e) => boxDown(e, i)} onpointermove={dragMove} onpointerup={dragEnd} onpointercancel={dragEnd}>
      <span class="n">{bars[i]}</span><span class="tag">{label(i)}</span>
      {#if mode === 'select' && i === app.selected}
        {#each EDGES as edge}
          <!-- svelte-ignore a11y_no_static_element_interactions -- pointer-only handles; the keyboard has Alt+arrows and , . for the same job -->
          <span class="handle {edge}" data-edge={edge} onpointerdown={(e) => handleDown(e, i, edge)} onpointermove={dragMove} onpointerup={dragEnd} onpointercancel={dragEnd}></span>
        {/each}
      {/if}
    </button>
  {/each}
  {#if ghost}<div class="box ghost" style:--x={ghost.x} style:--y={ghost.y} style:--w={ghost.w} style:--h={ghost.h}></div>{/if}
  {#if !doc}<p class="empty">Open a PDF to start.</p>{/if}
</div>

<style>
  .page { position: relative; width: calc(var(--zoom) * 100%); aspect-ratio: var(--aspect); max-width: 100%; background: var(--paper); margin: 0 auto; }
  .page.drawing { touch-action: none; cursor: crosshair; }
  canvas { width: 100%; height: 100%; display: block; }
  .box { position: absolute; left: calc(var(--x) * 100%); top: calc(var(--y) * 100%); width: calc(var(--w) * 100%); height: calc(var(--h) * 100%); padding: 0; min-height: 0; border: 1px solid color-mix(in srgb, var(--on-paper-accent) 50%, transparent); border-radius: 2px; background: color-mix(in srgb, var(--on-paper-accent) 6%, transparent); text-align: left; transition: background 0.12s; }
  .page.drawing .box { pointer-events: none; }
  .box.ramp { background: color-mix(in srgb, var(--on-paper-ramp) 12%, transparent); border-color: color-mix(in srgb, var(--on-paper-ramp) 60%, transparent); }
  .box.sel { outline: 2px solid var(--on-paper-accent); touch-action: none; cursor: move; }
  .handle { position: absolute; background: var(--on-paper-accent); opacity: 0.55; touch-action: none; }
  .handle:hover { opacity: 1; }
  .handle.left, .handle.right { top: 0; bottom: 0; width: 14px; cursor: ew-resize; }
  .handle.left { left: -7px; }
  .handle.right { right: -7px; }
  .handle.top, .handle.bottom { left: 0; right: 0; height: 14px; cursor: ns-resize; }
  .handle.top { top: -7px; }
  .handle.bottom { bottom: -7px; }
  .box.playing { background: color-mix(in srgb, var(--on-paper-play) 35%, transparent); border-color: var(--on-paper-play); }
  .ghost { border-style: dashed; pointer-events: none; }
  .n { position: absolute; top: -1px; left: 2px; font-size: 10px; font-weight: 700; color: var(--on-paper-accent); }
  .tag { position: absolute; bottom: 0; left: 2px; font-size: 10px; color: var(--on-paper-tag); white-space: nowrap; }
  .empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--fg-muted); margin: 0; }
</style>
