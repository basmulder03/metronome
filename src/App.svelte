<script lang="ts">
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import { openPdf } from './features/score/pdf';
  import { beatRange, clickEvents, longExportWarning, Player, renderJob } from './features/playback/audio';
  import { countIn, firstStepOf, stopStepFrom } from './features/tempo-map/timeline';
  import { type Part, partIndexOf, partsOf } from './features/structure/parts';
  import { detectMeasures } from './features/score/detect';
  import { dragEdge, looksLikePickup, mergeMeasures, moveBox, removeMeasure, replaceBoxes } from './features/score/markup';
  import { actionFor, type Action } from './features/score/shortcuts';
  import ShortcutsDialog from './features/score/ShortcutsDialog.svelte';
  import { createHistory } from './shared/history';
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
  import AdminPanel from './features/admin/AdminPanel.svelte';
  import PlaylistPanel from './features/playlist/PlaylistPanel.svelte';
  import { initPlaylists } from './features/playlist/playlist.svelte';
  import LibraryPanel from './features/library/LibraryPanel.svelte';
  import { attachPdf, create, entry, init, lastId, lib, loadPdf, rememberLast, rename, saveCurrent, useUser } from './features/library/library.svelte';
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

  let doc = $state<PDFDocumentProxy | null>(null);
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
  let adminPanel = $state<AdminPanel>();
  let shortcutsDialog = $state<ShortcutsDialog>();
  let saveTimer = 0;
  // Undo and redo over the piece (named `edits`: `history` is the browser's own, used for the address bar below)
  const edits = createHistory(JSON.stringify(emptyPiece()));
  // Autosave: reading the whole piece makes this re-run on any markup edit; writes are debounced.
  $effect(() => {
    edits.note(JSON.stringify(app.piece));
    if (!lib.currentId) return;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void saveCurrent(app.piece), 100);
  });

  const load = async (blob: Blob) => openPdf(new Uint8Array(await blob.arrayBuffer()));

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
    edits.reset(JSON.stringify(app.piece));
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
      if (e) { app.piece = structuredClone($state.snapshot(e.piece)) as typeof app.piece; edits.reset(JSON.stringify(app.piece)); }
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

  async function play(from: number, to: number, loop: boolean, endStep?: number) {
    if (!app.piece.measures.length) return;
    const tl = timeline();
    const pre = loop ? [] : countIn(app.piece, tl, beatRange(tl, from, to, endStep)[0], app.piece.countIn ?? 0);
    playing = await player.play(tl, from, to, loop, { subdivide }, pre, endStep);
    if (playing && endStep !== undefined) void announceStop(tl, endStep);
  }

  /** The sheet has several parts and playback stopped at the end of one: get the next part ready, so Space or Play continues. */
  async function announceStop(tl: ReturnType<typeof timeline>, endStep: number) {
    if (!(await player.whenDone)) return; // stopped by the player, not by reaching the end of the part
    const next = tl.steps[endStep + 1];
    if (!next) return;
    app.selected = next.measure;
    if (doc) pageNum = app.piece.measures[next.measure].page;
    status = `End of “${tl.parts[tl.partOfStep[endStep]].name}”. Press Space or Play to continue with “${tl.parts[tl.partOfStep[endStep + 1]].name}”.`;
  }

  /** Play from the selected measure to the end, or to the end of its part when the sheet is set to stop after each part (or the part is flagged). */
  function playFromSelected() {
    const tl = timeline();
    const from = Math.max(app.selected, 0);
    const end = stopStepFrom(tl, firstStepOf(tl, from), app.piece.afterPart ?? 'continue');
    return play(from, app.piece.measures.length - 1, false, end);
  }

  async function exportWav(part?: Part) {
    if (!app.piece.measures.length) return;
    const tl = timeline();
    const last = app.piece.measures.length - 1;
    // one part: from its first measure to where the played order leaves it
    const end = part ? stopStepFrom(tl, firstStepOf(tl, part.start), 'stop') : undefined;
    const [from, to] = part ? [part.start, part.end] : [0, last];
    const job = clickEvents(tl, from, to, { subdivide }, countIn(app.piece, tl, beatRange(tl, from, to, end)[0], app.piece.countIn ?? 0), end);
    const warning = longExportWarning(job.seconds);
    if (warning && !confirm(warning)) return;
    busy = true;
    progress = 0;
    try {
      const blob = await renderJob(job, (f) => (progress = f));
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: part ? `${current?.title ?? 'click-track'} - ${part.name}.wav` : 'click-track.wav' });
      a.click();
      URL.revokeObjectURL(a.href);
    } finally { busy = false; }
  }

  /**
   * Find the measures on every page. Pages that already have boxes keep what the user set on them (tempos, time signatures,
   * repeat marks) and only get new shapes, so re-running this after a correction, or on another part's PDF, loses nothing.
   */
  async function autoDetect() {
    if (!doc || !view) return;
    edits.checkpoint(); // detecting is one undo step
    let total = 0, pagesWith = 0;
    for (let i = 0; i < doc.numPages; i++) {
      status = `Detecting measures… page ${i + 1} of ${doc.numPages}`;
      const rects = detectMeasures(await view.bitmap(1400, i));
      if (!rects.length) continue; // leave a page alone that shows no staves (a title page, say)
      replaceBoxes(app.piece, i, rects);
      total += rects.length;
      pagesWith++;
    }
    app.selected = -1;
    mode = 'select';
    status = total
      ? `Found ${total} measures on ${pagesWith} of ${doc.numPages} pages. Tempos and time signatures you had set are kept. Check the boxes, then fix misses by dragging, with Split (S) or Merge (M).${looksLikePickup(app.piece) ? ' Measure 1 looks short: if it is an upbeat, select it and choose "Only the last beats".' : ''}`
      : 'No staves found — draw the boxes by hand.';
  }

  const current = $derived(entry(lib.currentId));
  const parts = $derived(partsOf(app.piece.measures));
  const selectedPart = $derived(app.selected >= 0 ? partIndexOf(parts, app.selected) : -1);
  function goToPart(i: number) {
    const part = parts[i];
    if (!part) return;
    app.selected = part.start;
    if (doc) pageNum = app.piece.measures[part.start].page;
  }
  async function renameCurrent() {
    if (!current) return;
    const t = prompt('Rename this piece', current.title);
    if (t) await rename(current.id, t);
  }

  /** Carry out a keyboard shortcut. Edits to the piece go through the same code as the mouse and buttons. */
  function run(a: Action) {
    const ms = app.piece.measures;
    const i = app.selected;
    const has = i >= 0 && i < ms.length;
    switch (a.type) {
      case 'delete':
        if (!has) return;
        edits.checkpoint();
        removeMeasure(app.piece, i);
        app.selected = Math.min(i, ms.length - 1); // the next box takes its place
        break;
      case 'select': {
        if (!ms.length) return;
        app.selected = Math.min(ms.length - 1, Math.max(0, has ? i + a.delta : 0));
        if (doc) pageNum = ms[app.selected].page;
        break;
      }
      case 'nudge': if (has) moveBox(app.piece, i, a.dx, a.dy); break;
      case 'resize': if (has) { if (a.dw) dragEdge(app.piece, i, 'right', a.dw); if (a.dh) dragEdge(app.piece, i, 'bottom', a.dh); } break;
      case 'bar': if (has) dragEdge(app.piece, i, 'right', a.dx); break;
      case 'mode': mode = a.mode; break;
      case 'merge':
        if (has) edits.checkpoint();
        if (has && !mergeMeasures(app.piece, i)) status = 'Nothing to merge with: the next measure has to be on the same page.';
        break;
      case 'play': if (playing) player.stop(); else void playFromSelected(); break;
      case 'escape': if (playing) player.stop(); else app.selected = -1; break;
      case 'undo': case 'redo': {
        const json = a.type === 'undo' ? edits.undo() : edits.redo();
        if (json) { app.piece = JSON.parse(json); app.selected = Math.min(app.selected, app.piece.measures.length - 1); }
        break;
      }
      case 'rename': void renameCurrent(); break;
      case 'help': shortcutsDialog?.show(); break;
    }
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const action = actionFor(e, {
      typing: !!t && (t.matches('input, textarea, select') || t.isContentEditable),
      modal: !!document.querySelector('dialog[open]'),
      // a measure box or tile is a button too, but Space on it should play: clicking already selects it
      onButton: !!t && t.matches('button, summary, a, [role=button]') && !t.matches('.box, .tile'),
    });
    if (!action) return;
    e.preventDefault();
    run(action);
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

<svelte:window onkeydown={onKey} />

<div class="shell">
<header>
  <label class="file">{entry(lib.currentId) && !entry(lib.currentId)?.hasPdf ? 'Attach PDF' : 'Open PDF'}<input type="file" accept="application/pdf" onchange={open} hidden /></label>
  <Button onclick={() => libraryPanel.show()}>Library</Button>
  <Button onclick={() => playlistPanel.show()}>Playlists</Button>
  {#if auth.user?.role === 'admin'}<Button onclick={() => void adminPanel?.show()}>Admin</Button>{/if}
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
    <Button disabled={busy} onclick={() => void exportWav()}>{busy ? `Rendering… ${Math.round(progress * 100)}%` : 'Export WAV'}</Button>
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
      {#if parts.length}
        <label>At the end of a part
          <select value={app.piece.afterPart ?? 'continue'} onchange={(e) => (app.piece.afterPart = e.currentTarget.value === 'stop' ? 'stop' : undefined)}>
            <option value="continue">Keep playing</option>
            <option value="stop">Stop and wait</option>
          </select>
        </label>
      {/if}
      <label>Theme <ThemeToggle /></label>
      <Button size="sm" onclick={() => shortcutsDialog?.show()}>Keyboard shortcuts (?)</Button>
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
<ShortcutsDialog bind:this={shortcutsDialog} />
{#if found}{#key found}<ReadMarksDialog bind:this={readDialog} suggestions={found} onapply={addFound} oncancel={() => (found = null)} />{/key}{/if}
{#if auth.user?.role === 'admin'}<AdminPanel bind:this={adminPanel} />{/if}
<PlaylistPanel bind:this={playlistPanel} {subdivide} />
<LibraryPanel bind:this={libraryPanel} onopen={(id) => void openEntry(id)} onreplace={async (id, blob) => { if (id === lib.currentId) { doc = await load(blob); pageNum = 0; } }} />
{#if current}
  <div class="titlebar"><strong>{current.title}</strong><Button size="sm" onclick={() => void renameCurrent()} title="Rename (F2)">Rename</Button>
    {#if parts.length}
      <label class="part">Part
        <select aria-label="Go to part" value={selectedPart} onchange={(e) => goToPart(+e.currentTarget.value)}>
          {#if selectedPart < 0}<option value={-1}>Choose…</option>{/if}
          {#each parts as pt (pt.index)}<option value={pt.index}>{pt.name}{pt.pause ? ' ⏸' : ''}</option>{/each}
        </select>
      </label>
      <Button size="sm" disabled={selectedPart < 0 || busy} onclick={() => void exportWav(parts[selectedPart])} title="Export only the selected part as audio">Export this part</Button>
    {/if}
  </div>
{/if}

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
      <PdfView bind:this={view} {doc} {pageNum} {zoom} {mode} onstep={() => edits.checkpoint()} />
    {:else}
      <MeasureStrip />
    {/if}
  </div>
  <Sheet><Inspector onplay={play} /><StructureEditor /></Sheet>
</main>
</div>

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
  .titlebar { display: flex; gap: var(--space-2); align-items: center; padding: 6px var(--space-3); border-bottom: 1px solid var(--border); }
  .titlebar strong { overflow-wrap: anywhere; }
  .titlebar .part { flex-direction: row; align-items: center; gap: var(--space-2); margin-left: auto; color: var(--fg); font-size: var(--font-md); }
  .status { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; margin: 0; padding: 6px var(--space-3); font-size: 13px; background: var(--surface); color: var(--fg-muted); }
  dialog { background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-4); max-width: min(420px, calc(100vw - 2 * var(--space-4))); }
  dialog::backdrop { background: var(--scrim); }
  .shell { display: flex; flex-direction: column; }
  main { display: grid; grid-template-columns: 1fr; }
  .score { overflow: auto; padding: var(--space-2); padding-bottom: 45vh; background: var(--surface); } /* room for the phone bottom sheet */
  @media (min-width: 900px) {
    header { position: sticky; top: 0; }
    .shell { height: 100vh; }
    main { grid-template-columns: 1fr 340px; flex: 1; min-height: 0; }
    main > :global(aside), .score { overflow: auto; }
    .score { padding-bottom: var(--space-2); }
  }
</style>
