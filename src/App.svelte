<script lang="ts">
  import * as pdfjs from 'pdfjs-dist';
  import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
  import { Player, renderWav } from './features/playback/audio';
  import { detectMeasures } from './features/score/detect';
  import { insertMeasures, removeMeasure } from './features/score/markup';
  import Inspector from './features/tempo-map/Inspector.svelte';
  import PdfView from './features/score/PdfView.svelte';
  import { app, save, timeline } from './shared/store.svelte';

  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  let doc = $state<pdfjs.PDFDocumentProxy | null>(null);
  let pageNum = $state(0);
  let zoom = $state(1);
  let mode = $state<'draw' | 'split' | 'select'>('draw');
  let subdivide = $state(false);
  let playing = $state(false);
  let busy = $state(false);
  let view: PdfView;
  let status = $state('');

  // Autosave: reading the whole piece makes this re-run on any markup edit.
  $effect(() => { JSON.stringify(app.piece); save(); });

  const player = new Player();
  player.onMeasure = (m) => {
    app.playing = m;
    const pg = app.piece.measures[m]?.page;
    if (pg !== undefined) pageNum = pg;
  };
  player.onStop = () => { playing = false; app.playing = -1; };

  async function open(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!f) return;
    doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
    pageNum = 0;
  }

  async function play(from: number, to: number, loop: boolean) {
    if (!app.piece.measures.length) return;
    playing = true;
    await player.play(timeline(), from, to, loop, { subdivide });
  }
  const playFromSelected = () => play(Math.max(app.selected, 0), app.piece.measures.length - 1, false);

  async function exportWav() {
    if (!app.piece.measures.length) return;
    busy = true;
    try {
      const blob = await renderWav(timeline(), 0, app.piece.measures.length - 1, { subdivide });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'click-track.wav' });
      a.click();
      URL.revokeObjectURL(a.href);
    } finally { busy = false; }
  }

  /** Replace this page's boxes with detected ones; events on removed measures are dropped, others stay attached. */
  function autoDetect() {
    const found = detectMeasures(view.bitmap());
    if (!found.length) { status = 'No staves found on this page — draw the boxes by hand.'; return; }
    const ms = app.piece.measures;
    if (ms.some((m) => m.page === pageNum) && !confirm('Replace the measure boxes on this page?')) return;
    for (let i = ms.length - 1; i >= 0; i--) if (ms[i].page === pageNum) removeMeasure(app.piece, i);
    const at = ms.findIndex((m) => m.page > pageNum);
    insertMeasures(app.piece, at < 0 ? ms.length : at, found.map((rect) => ({ id: crypto.randomUUID(), page: pageNum, rect })));
    app.selected = -1;
    mode = 'select';
    status = `Found ${found.length} measures — check them, then fix any misses with Draw/Split.`;
  }

  const pages = $derived(doc?.numPages ?? 1);
</script>

<header>
  <label class="file">Open PDF<input type="file" accept="application/pdf" onchange={open} hidden /></label>
  <span class="grp">
    <button disabled={pageNum === 0} onclick={() => pageNum--}>‹</button>
    <span>{pageNum + 1}/{pages}</span>
    <button disabled={pageNum >= pages - 1} onclick={() => pageNum++}>›</button>
  </span>
  <span class="grp">
    <button onclick={() => (zoom = Math.max(0.5, zoom - 0.25))}>−</button>
    <button onclick={() => (zoom = Math.min(3, zoom + 0.25))}>+</button>
  </span>
  <span class="grp">
    <button onclick={autoDetect} disabled={!doc} title="Find staves and barlines on this page">Auto-detect</button>
    <button class:on={mode === 'draw'} onclick={() => (mode = 'draw')} title="Drag a box around each staff line">Draw</button>
    <button class:on={mode === 'split'} onclick={() => (mode = 'split')} title="Tap a barline to split a box">Split</button>
    <button class:on={mode === 'select'} onclick={() => (mode = 'select')}>Select</button>
  </span>
  <span class="grp">
    {#if playing}
      <button class="primary" onclick={() => player.stop()}>Stop</button>
    {:else}
      <button class="primary" onclick={playFromSelected}>Play{app.selected >= 0 ? ` from ${app.selected + 1}` : ''}</button>
    {/if}
    <label class="chk"><input type="checkbox" bind:checked={subdivide} /> subdivisions</label>
    <button disabled={busy} onclick={exportWav}>{busy ? 'Rendering…' : 'Export WAV'}</button>
  </span>
</header>

{#if status}<p class="status" role="status">{status}</p>{/if}
<main>
  <div class="score"><PdfView bind:this={view} {doc} {pageNum} {zoom} {mode} /></div>
  <aside><Inspector onplay={play} /></aside>
</main>

<style>
  header { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--line); position: static; top: 0; background: var(--bg); z-index: 5; }
  .grp { display: flex; gap: 6px; align-items: center; }
  .file { display: inline-flex; flex-direction: row; align-items: center; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; min-height: 40px; cursor: pointer; color: var(--fg); font-size: 15px; }
  .chk { flex-direction: row; align-items: center; font-size: 13px; }
  .status { margin: 0; padding: 6px 12px; font-size: 13px; background: var(--card); color: var(--mut); }
  main { display: grid; grid-template-columns: 1fr; }
  .score { overflow: auto; padding: 8px; background: var(--card); }
  /* phones: inspector is a bottom sheet so edits are visible next to the score */
  aside { position: fixed; left: 0; right: 0; bottom: 0; max-height: 42vh; overflow: auto; padding: 12px; background: var(--bg); border-top: 1px solid var(--line); box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15); z-index: 4; }
  .score { padding-bottom: 45vh; }
  @media (min-width: 900px) {
    header { position: sticky; }
    main { grid-template-columns: 1fr 340px; height: calc(100vh - 57px); }
    .score, aside { overflow: auto; }
    aside { position: static; max-height: none; box-shadow: none; border-top: 0; border-left: 1px solid var(--line); }
    .score { padding-bottom: 8px; }
  }
</style>
