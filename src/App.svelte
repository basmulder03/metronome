<script lang="ts">
  import * as pdfjs from 'pdfjs-dist';
  import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
  import { beatRange, Player, renderWav } from './features/playback/audio';
  import { countIn } from './features/tempo-map/timeline';
  import { detectMeasures } from './features/score/detect';
  import { insertMeasures, removeMeasure } from './features/score/markup';
  import StructureEditor from './features/structure/StructureEditor.svelte';
  import Inspector from './features/tempo-map/Inspector.svelte';
  import PdfView from './features/score/PdfView.svelte';
  import { app, save, timeline } from './shared/store.svelte';
  import Button from './shared/ui/Button.svelte';
  import Segmented from './shared/ui/Segmented.svelte';
  import Sheet from './shared/ui/Sheet.svelte';
  import ThemeToggle from './shared/ui/ThemeToggle.svelte';

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
    const tl = timeline();
    const pre = loop ? [] : countIn(app.piece, tl, beatRange(tl, from, to)[0], app.piece.countIn ?? 0);
    await player.play(tl, from, to, loop, { subdivide }, pre);
  }
  const playFromSelected = () => play(Math.max(app.selected, 0), app.piece.measures.length - 1, false);

  async function exportWav() {
    if (!app.piece.measures.length) return;
    busy = true;
    try {
      const tl = timeline();
      const blob = await renderWav(tl, 0, app.piece.measures.length - 1, { subdivide }, countIn(app.piece, tl, 0, app.piece.countIn ?? 0));
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
    <Button disabled={pageNum === 0} onclick={() => pageNum--} aria-label="Previous page">‹</Button>
    <span>{pageNum + 1}/{pages}</span>
    <Button disabled={pageNum >= pages - 1} onclick={() => pageNum++} aria-label="Next page">›</Button>
  </span>
  <span class="grp">
    <Button onclick={() => (zoom = Math.max(0.5, zoom - 0.25))} aria-label="Zoom out">−</Button>
    <Button onclick={() => (zoom = Math.min(3, zoom + 0.25))} aria-label="Zoom in">+</Button>
  </span>
  <span class="grp">
    <Button onclick={autoDetect} disabled={!doc} title="Find staves and barlines on this page">Auto-detect</Button>
    <Segmented bind:value={mode} options={[
      { value: 'draw', label: 'Draw', title: 'Drag a box around each staff line' },
      { value: 'split', label: 'Split', title: 'Tap a barline to split a box' },
      { value: 'select', label: 'Select' },
    ]} />
  </span>
  <span class="grp">
    {#if playing}
      <Button variant="primary" onclick={() => player.stop()}>Stop</Button>
    {:else}
      <Button variant="primary" onclick={playFromSelected} aria-label={app.selected >= 0 ? `Play from ${app.selected + 1}` : 'Play'}>Play</Button>
    {/if}
    <Button disabled={busy} onclick={exportWav}>{busy ? 'Rendering…' : 'Export WAV'}</Button>
  </span>
  <details class="opts end">
    <summary>Options</summary>
    <div class="panel">
      <label class="check"><input type="checkbox" bind:checked={subdivide} /> Click on subdivisions</label>
      <label>Count-in
        <select bind:value={app.piece.countIn}>
          <option value={0}>None</option>
          <option value={1}>1 bar</option>
          <option value={2}>2 bars</option>
        </select>
      </label>
      <label>Theme <ThemeToggle /></label>
    </div>
  </details>
</header>

{#if status}<p class="status" role="status">{status}</p>{/if}
<main>
  <div class="score"><PdfView bind:this={view} {doc} {pageNum} {zoom} {mode} /></div>
  <Sheet><Inspector onplay={play} /><StructureEditor /></Sheet>
</main>

<style>
  header { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); align-items: center; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border); background: var(--bg); z-index: 5; }
  .grp { display: flex; gap: 6px; align-items: center; flex: none; } /* fixed width: a changing label must not re-wrap the header and shift the score */
  .end { margin-left: auto; }
  .opts { position: relative; }
  .opts summary { cursor: pointer; list-style: none; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-2) var(--space-3); min-height: var(--tap); display: inline-flex; align-items: center; }
  .opts .panel { position: absolute; right: 0; top: calc(100% + var(--space-1)); z-index: 6; display: grid; gap: var(--space-3); min-width: 220px; padding: var(--space-3); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 4px 12px var(--shadow); }
  .file { display: inline-flex; flex-direction: row; align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-2) var(--space-3); min-height: var(--tap); cursor: pointer; color: var(--fg); font-size: var(--font-md); }
  .status { margin: 0; padding: 6px var(--space-3); font-size: 13px; background: var(--surface); color: var(--fg-muted); }
  main { display: grid; grid-template-columns: 1fr; }
  .score { overflow: auto; padding: var(--space-2); padding-bottom: 45vh; background: var(--surface); } /* room for the phone bottom sheet */
  @media (min-width: 900px) {
    header { position: sticky; top: 0; }
    main { grid-template-columns: 1fr 340px; height: calc(100vh - 57px); }
    main > :global(aside), .score { overflow: auto; }
    .score { padding-bottom: var(--space-2); }
  }
</style>
