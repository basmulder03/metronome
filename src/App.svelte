<script lang="ts">
  import * as pdfjs from 'pdfjs-dist';
  import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
  import { beatRange, clickEvents, longExportWarning, Player, renderJob } from './features/playback/audio';
  import { countIn } from './features/tempo-map/timeline';
  import { detectMeasures } from './features/score/detect';
  import { insertMeasures, removeMeasure } from './features/score/markup';
  import StructureEditor from './features/structure/StructureEditor.svelte';
  import Inspector from './features/tempo-map/Inspector.svelte';
  import MeasureStrip from './features/score/MeasureStrip.svelte';
  import ReadMarksDialog from './features/score/ReadMarksDialog.svelte';
  import { applySuggestions, suggestFromText, type PageText, type Suggestion } from './features/score/readmarks';
  import { readPageText } from './features/score/textlayer';
  import { ocrPages } from './features/score/ocr';
  import PdfView from './features/score/PdfView.svelte';
  import { codeFromHash, decodeShare } from './features/share/codec';
  import { app, timeline } from './shared/store.svelte';
  import { emptyPiece } from './shared/types';
  import PlaylistPanel from './features/playlist/PlaylistPanel.svelte';
  import { initPlaylists } from './features/playlist/playlist.svelte';
  import LibraryPanel from './features/library/LibraryPanel.svelte';
  import { attachPdf, create, entry, init, lastId, lib, loadPdf, rememberLast, saveCurrent, useUser } from './features/library/library.svelte';
  import { auth, signOut } from './features/auth/auth.svelte';
  import { hooks, startSync, sync, syncNow } from './features/sync/sync.svelte';
  import { onDestroy } from 'svelte';
  import { useDatabase, wipeDatabase } from './shared/idb';
  import Button from './shared/ui/Button.svelte';
  import Segmented from './shared/ui/Segmented.svelte';
  import Sheet from './shared/ui/Sheet.svelte';
  import ThemeToggle from './shared/ui/ThemeToggle.svelte';

  let { userId }: { userId: string } = $props();
  // a piece left in the store by the guest view must not show up as scratch work in the editor
  app.piece = emptyPiece();
  app.selected = -1;
  // this account's own local database and remembered state, before anything reads them
  // svelte-ignore state_referenced_locally -- Root remounts this component (a {#key}) when the account changes
  useDatabase(`metronome-${userId}`);
  // svelte-ignore state_referenced_locally
  useUser(userId);

  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  let doc = $state<pdfjs.PDFDocumentProxy | null>(null);
  let pageNum = $state(0);
  let zoom = $state(1);
  let mode = $state<'draw' | 'split' | 'select'>('draw');
  let subdivide = $state(false);
  let playing = $state(false);
  let busy = $state(false);
  let progress = $state(0);
  let view = $state<PdfView>();
  let status = $state('');

  let stopSync = () => {};
  onDestroy(() => stopSync());
  let libraryPanel: LibraryPanel;
  let playlistPanel: PlaylistPanel;
  let saveTimer = 0;
  // Autosave: reading the whole piece makes this re-run on any markup edit; writes are debounced.
  $effect(() => {
    JSON.stringify(app.piece);
    if (!lib.currentId) return;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void saveCurrent(app.piece), 100);
  });

  const load = async (blob: Blob) => pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;

  /** Switch the editor to a library piece (and its PDF, when it has one). */
  async function openEntry(id: string, pdf?: Blob) {
    const e = entry(id);
    if (!e) return;
    player.stop();
    clearTimeout(saveTimer);
    await saveCurrent(app.piece);
    // load the PDF first so the piece and its page swap in together
    const blob = pdf ?? (e.hasPdf ? await loadPdf(id) : undefined);
    const next = blob ? await load(blob) : null;
    lib.currentId = id;
    rememberLast(id);
    app.piece = structuredClone($state.snapshot(e.piece)) as typeof app.piece;
    app.selected = -1;
    pageNum = 0;
    doc = next;
  }

  // Restore the last piece (with its PDF) on startup.
  void (async () => {
    await init();
    await initPlaylists();
    // what sync changes in the open piece shows up straight away
    hooks.applied = (kind, id, what) => {
      if (kind !== 'pieces' || id !== lib.currentId) return;
      if (what === 'dropped') { app.piece = emptyPiece(); app.selected = -1; doc = null; status = 'This piece was deleted on another device.'; return; }
      const e = entry(id);
      if (e) app.piece = structuredClone($state.snapshot(e.piece)) as typeof app.piece;
    };
    stopSync = startSync();
    const id = lastId();
    if (id && entry(id)) await openEntry(id);
    await importFromHash();
  })();

  let incoming = $state<{ title: string; piece: typeof app.piece } | null>(null);
  let importDialog: HTMLDialogElement;

  /** A share link carries markup only; confirm before adding it to the library. */
  async function importFromHash() {
    const code = codeFromHash(location.hash);
    if (!code) return;
    history.replaceState(null, '', location.pathname + location.search); // never re-import on reload
    const decoded = await decodeShare(code);
    if (!decoded) { status = 'That share link is not valid.'; return; }
    incoming = decoded;
    importDialog.showModal();
  }
  async function acceptImport() {
    importDialog.close();
    if (!incoming) return;
    const id = await create(incoming.title || 'Shared piece', undefined, incoming.piece);
    incoming = null;
    await openEntry(id);
    status = 'Imported without a PDF. Use "Attach PDF" to put your own copy of the score behind it.';
  }

  const player = new Player();
  player.onMeasure = (m) => {
    app.playing = m;
    const pg = app.piece.measures[m]?.page;
    if (pg !== undefined) pageNum = pg;
  };
  player.onStop = () => { playing = false; app.playing = -1; };

  async function open(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const picked = input.files?.[0];
    if (!picked) return;
    // read the bytes before resetting the input: clearing it can release the File, and reading afterwards may fail
    const f = Object.assign(new Blob([await picked.arrayBuffer()], { type: 'application/pdf' }), { name: picked.name });
    input.value = ''; // allow picking the same file again
    const cur = entry(lib.currentId);
    if (cur && !cur.hasPdf) { // a piece without a PDF (e.g. from a shared link) gets this one
      await attachPdf(cur.id, f);
      doc = await load(f);
      pageNum = 0;
      return;
    }
    const id = await create(f.name.replace(/\.pdf$/i, ''), f, emptyPiece());
    await openEntry(id, f);
  }

  async function play(from: number, to: number, loop: boolean) {
    if (!app.piece.measures.length) return;
    const tl = timeline();
    const pre = loop ? [] : countIn(app.piece, tl, beatRange(tl, from, to)[0], app.piece.countIn ?? 0);
    playing = await player.play(tl, from, to, loop, { subdivide }, pre);
  }
  const playFromSelected = () => play(Math.max(app.selected, 0), app.piece.measures.length - 1, false);

  async function exportWav() {
    if (!app.piece.measures.length) return;
    const tl = timeline();
    const job = clickEvents(tl, 0, app.piece.measures.length - 1, { subdivide }, countIn(app.piece, tl, 0, app.piece.countIn ?? 0));
    const warning = longExportWarning(job.seconds);
    if (warning && !confirm(warning)) return;
    busy = true;
    progress = 0;
    try {
      const blob = await renderJob(job, (f) => (progress = f));
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'click-track.wav' });
      a.click();
      URL.revokeObjectURL(a.href);
    } finally { busy = false; }
  }

  /** Replace this page's boxes with detected ones; events on removed measures are dropped, others stay attached. */
  async function autoDetect() {
    const found = detectMeasures(await view!.bitmap());
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

  let found = $state<Suggestion[] | null>(null);
  let ocrOffer = $state(false);
  let readDialog = $state<ReadMarksDialog>();

  /** Look for tempo marks, time signatures and rit./accel. words in the PDF's own text; the user reviews them before anything changes. */
  async function readFromPdf() {
    if (!doc) return;
    status = 'Reading text from the PDF…';
    const texts: PageText[] = [];
    for (let i = 0; i < doc.numPages; i++) if (app.piece.measures.some((m) => m.page === i)) texts.push(await readPageText(doc, i));
    const s = suggestFromText(texts, app.piece);
    if (!s.length) {
      if (texts.every((t) => !t.items.length)) {
        ocrOffer = true;
        status = 'This PDF has no text layer (it looks like a scan). OCR can read tempo marks and rit./accel. words from it, but not time signatures.';
      } else status = 'No tempo marks, time signatures or rit./accel. words found. Set them in the editor.';
      return;
    }
    showFound(s);
  }

  function showFound(s: Suggestion[]) {
    status = '';
    ocrOffer = false;
    found = s;
    queueMicrotask(() => readDialog?.show());
  }

  /** Scanned PDFs: read the strip above each system with OCR (the engine downloads once and is then cached). */
  async function readWithOcr() {
    if (!doc) return;
    ocrOffer = false;
    status = 'Loading the OCR engine (first time only)…';
    try {
      const texts = await ocrPages(doc, app.piece.measures, (d, t) => (status = `Reading the page text… ${d}/${t}`));
      const s = suggestFromText(texts, app.piece);
      if (s.length) showFound(s);
      else status = 'OCR found no tempo marks or rit./accel. words. Set them in the editor.';
    } catch {
      status = 'OCR could not run (is the connection down on the first use?). Set tempos in the editor.';
    }
  }
  function addFound(chosen: Suggestion[]) {
    const { applied, skipped } = applySuggestions(app.piece, chosen);
    status = `Added ${applied}${skipped ? `, kept ${skipped} you had already set` : ''}. Check them in the editor.`;
    found = null;
  }

  /** For shared computers: push what is pending, delete this account's local library and PDFs, then sign out. */
  async function signOutAndWipe() {
    if (!confirm('Remove all your pieces and saved PDFs from this device and sign out? Your markup stays in your account; the PDFs only exist on your devices, so they are gone from this one.')) return;
    await syncNow();
    if (sync.status !== 'idle' && !confirm('Your latest changes could not be synced (offline?). If you continue they are lost. Continue anyway?')) return;
    clearTimeout(saveTimer);
    stopSync();
    await wipeDatabase();
    try { localStorage.removeItem(`metronome.last.${userId}`); } catch { /* nothing to remove */ }
    signOut();
  }

  const pages = $derived(doc?.numPages ?? 1);
</script>

<header>
  <label class="file">{entry(lib.currentId) && !entry(lib.currentId)?.hasPdf ? 'Attach PDF' : 'Open PDF'}<input type="file" accept="application/pdf" onchange={open} hidden /></label>
  <Button onclick={() => libraryPanel.show()}>Library</Button>
  <Button onclick={() => playlistPanel.show()}>Playlists</Button>
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
    <Button onclick={() => void readFromPdf()} disabled={!doc || !app.piece.measures.length} title="Read tempo marks, time signatures and rit./accel. from the PDF's text">Read from PDF</Button>
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
    <Button disabled={busy} onclick={exportWav}>{busy ? `Rendering… ${Math.round(progress * 100)}%` : 'Export WAV'}</Button>
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
      <div class="acct">
        <span class="mut">{sync.status === 'syncing' ? 'Syncing…' : sync.status === 'offline' ? 'Offline: changes sync when you reconnect' : sync.status === 'error' ? 'Sync failed, try again' : sync.last ? 'Up to date' : 'Not synced yet'}</span>
        <Button size="sm" onclick={() => void syncNow()} disabled={sync.status === 'syncing'}>Sync now</Button>
        <span class="mut">Signed in as {auth.user?.email}</span>
        <Button size="sm" onclick={signOut}>Sign out</Button>
        <Button size="sm" onclick={() => void signOutAndWipe()} title="For shared computers">Sign out and remove my data from this device</Button>
      </div>
    </div>
  </details>
</header>

<dialog bind:this={importDialog} aria-label="Import shared piece" onclose={() => (incoming = null)}>
  {#if incoming}
    <h3>Import shared piece?</h3>
    <p><strong>{incoming.title}</strong> · {incoming.piece.measures.length} measures</p>
    <p class="mut">Shared links contain the markup (tempos, meters, repeats), not the score. You can attach your own PDF afterwards.</p>
    <div class="row">
      <Button variant="primary" onclick={() => void acceptImport()}>Import</Button>
      <Button onclick={() => importDialog.close()}>Cancel</Button>
    </div>
  {/if}
</dialog>
{#if found}{#key found}<ReadMarksDialog bind:this={readDialog} suggestions={found} onapply={addFound} oncancel={() => (found = null)} />{/key}{/if}
<PlaylistPanel bind:this={playlistPanel} {subdivide} />
<LibraryPanel bind:this={libraryPanel} onopen={(id) => void openEntry(id)} />
{#if status}
  <div class="status" role="status">
    <span>{status}</span>
    {#if ocrOffer}<Button size="sm" onclick={() => void readWithOcr()}>Read with OCR (about 7 MB the first time)</Button>{/if}
  </div>
{/if}
<main data-piece={lib.currentId ?? ""}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable region must be reachable by keyboard (WCAG 2.1.1) -->
  <div class="score" role="region" aria-label="Score" tabindex="0">
    {#if doc || app.piece.measures.length === 0}
      <PdfView bind:this={view} {doc} {pageNum} {zoom} {mode} />
    {:else}
      <MeasureStrip />
    {/if}
  </div>
  <Sheet><Inspector onplay={play} /><StructureEditor /></Sheet>
</main>

<style>
  header { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); align-items: center; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border); background: var(--bg); z-index: 5; }
  .grp { display: flex; gap: 6px; align-items: center; flex: none; } /* fixed width: a changing label must not re-wrap the header and shift the score */
  .end { margin-left: auto; }
  .opts { position: relative; }
  .opts summary { cursor: pointer; list-style: none; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-2) var(--space-3); min-height: var(--tap); display: inline-flex; align-items: center; }
  .acct { display: grid; gap: var(--space-2); justify-items: start; }
  .acct .mut { margin: 0; font-size: var(--font-sm); overflow-wrap: anywhere; }
  .opts .panel { position: absolute; right: 0; top: calc(100% + var(--space-1)); z-index: 6; display: grid; gap: var(--space-3); min-width: 220px; padding: var(--space-3); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 4px 12px var(--shadow); }
  .file { display: inline-flex; flex-direction: row; align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-2) var(--space-3); min-height: var(--tap); cursor: pointer; color: var(--fg); font-size: var(--font-md); }
  .status { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; margin: 0; padding: 6px var(--space-3); font-size: 13px; background: var(--surface); color: var(--fg-muted); }
  dialog { background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-4); max-width: min(420px, calc(100vw - 2 * var(--space-4))); }
  dialog::backdrop { background: var(--scrim); }
  main { display: grid; grid-template-columns: 1fr; }
  .score { overflow: auto; padding: var(--space-2); padding-bottom: 45vh; background: var(--surface); } /* room for the phone bottom sheet */
  @media (min-width: 900px) {
    header { position: sticky; top: 0; }
    main { grid-template-columns: 1fr 340px; height: calc(100vh - 57px); }
    main > :global(aside), .score { overflow: auto; }
    .score { padding-bottom: var(--space-2); }
  }
</style>
