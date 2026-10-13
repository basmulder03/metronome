<script lang="ts">
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import { openPdf } from '../score/pdf';
  import { pulseIcon, resetIcon } from '../playback/favicon';
  import PlayBar from '../playback/PlayBar.svelte';
  import { beatSignal, clickOpts } from '../playback/sound.svelte';
  import { clickEvents, longExportWarning, Player, renderJob } from '../playback/audio';
  import MeasureStrip from '../score/MeasureStrip.svelte';
  import PdfView from '../score/PdfView.svelte';
  import { countIn } from '../tempo-map/timeline';
  import { app, choose, timeline } from '../../shared/store.svelte';
  import type { Piece } from '../../shared/types';
  import Button from '../../shared/ui/Button.svelte';

  // A signed-out visitor opening a share link: play, export and look at it with their own PDF; nothing is saved or editable.
  let { title, piece, editBy, onsignin }: { title: string; piece: Piece; editBy?: string; onsignin: () => void } = $props();

  // svelte-ignore state_referenced_locally -- the guest view is mounted once per shared piece
  app.piece = piece;
  app.selected = -1;

  let doc = $state<PDFDocumentProxy | null>(null);
  let pageNum = $state(0);
  let playing = $state(false);
  let busy = $state(false);
  const player = new Player();
  player.onMeasure = (m) => {
    app.playing = m;
    const pg = app.piece.measures[m]?.page;
    if (pg !== undefined && doc) pageNum = pg;
  };
  player.onBeat = (a) => { pulseIcon(a); beatSignal(a); };
  let position = $state(0);
  player.onProgress = (v) => { if (v >= 0) position = v; };
  player.onStop = () => { playing = false; app.playing = -1; resetIcon(); };
  const last = $derived(app.piece.measures.length - 1);

  async function attach(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    const bytes = new Uint8Array(await f.arrayBuffer()); // read before resetting the input
    input.value = '';
    doc = await openPdf(bytes); // kept in memory only
    pageNum = 0;
  }

  async function play() {
    const tl = timeline();
    const from = Math.max(app.selected, 0);
    const pre = countIn(app.piece, tl, tl.beats.findIndex((b) => b.measure === from), app.piece.countIn ?? 0);
    playing = await player.play(tl, from, last, false, () => clickOpts(), pre);
  }

  async function exportWav() {
    const tl = timeline();
    const job = clickEvents(tl, 0, last, clickOpts(), countIn(app.piece, tl, 0, app.piece.countIn ?? 0));
    const warning = longExportWarning(job.seconds);
    if (warning && !confirm(warning)) return;
    busy = true;
    try {
      const blob = await renderJob(job);
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${title || 'click-track'}.wav` });
      a.click();
      URL.revokeObjectURL(a.href);
    } finally { busy = false; }
  }
</script>

<header>
  <div class="who"><strong>{title}</strong> <span class="mut">shared with you · {piece.measures.length} measures{editBy ? ` · ${editBy} lets people with an account edit it` : ''}</span></div>
  <label class="file">Attach your PDF<input type="file" accept="application/pdf" onchange={attach} hidden /></label>
  {#if doc && doc.numPages > 1}
    <span class="grp">
      <Button disabled={pageNum === 0} onclick={() => pageNum--} aria-label="Previous page">‹</Button>
      <span>{pageNum + 1}/{doc.numPages}</span>
      <Button disabled={pageNum >= doc.numPages - 1} onclick={() => pageNum++} aria-label="Next page">›</Button>
    </span>
  {/if}
  <Button disabled={busy} onclick={() => void exportWav()}>{busy ? 'Rendering…' : 'Export WAV'}</Button>
  <Button onclick={onsignin}>Sign in to save a copy</Button>
</header>

<main class="score">
  {#if doc}
    <PdfView {doc} {pageNum} zoom={1} mode="select" />
  {:else}
    <MeasureStrip />
    <p class="mut hint">Shared links never include the score. Attach your own copy of the PDF to see it behind the measures.</p>
  {/if}
</main>
<PlayBar {playing} {position} onplay={() => void play()} onstop={() => player.stop()}
  onseek={(m, final) => { choose(m); position = m; if (doc) pageNum = app.piece.measures[m]?.page ?? pageNum; if (final && playing) void play(); }} />

<style>
  header { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); align-items: center; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border); }
  .who { display: grid; margin-right: auto; min-width: 0; }
  .who .mut { margin: 0; font-size: var(--font-sm); }
  .grp { display: flex; gap: 6px; align-items: center; }
  .file { display: inline-flex; flex-direction: row; align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-2) var(--space-3); min-height: var(--tap); cursor: pointer; color: var(--fg); font-size: var(--font-md); }
  .score { padding: var(--space-3); padding-bottom: calc(var(--bar-h) + var(--space-3)); background: var(--surface); min-height: calc(100vh - 70px); }
  .hint { margin-top: var(--space-4); }
</style>
