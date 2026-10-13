<script lang="ts">
  import { clickEvents, joinJobs, longExportWarning, Player, renderJob } from '../playback/audio';
  import { buildTimeline, countIn } from '../tempo-map/timeline';
  import { clickOpts, sound } from '../playback/sound.svelte';
  import { entry, lib } from '../library/library.svelte';
  import Button from '../../shared/ui/Button.svelte';
  import { encodePlaylist } from '../share/codec';
  import { shortLink } from '../share/link';
  import { createPlaylist, move, pl, removePlaylist, touch, type Playlist } from './playlist.svelte';

  let dialog: HTMLDialogElement;
  let selectedId = $state<string | null>(null);
  let adding = $state('');
  let busy = $state(false);
  let progress = $state(0);
  let now = $state<{ index: number; title: string; measure: number; total: number; gap: boolean } | null>(null);
  const player = new Player();
  let cancelled = false;

  const sel = $derived(pl.lists.find((p) => p.id === selectedId));
  const rows = $derived(sel?.items.map((id) => ({ id, e: entry(id) })) ?? []);
  const playable = $derived(rows.filter((r) => r.e && r.e.piece.measures.length > 0));

  export function show() { dialog.showModal(); }

  async function create() {
    const name = prompt('Playlist name', 'Set list');
    if (name) selectedId = (await createPlaylist(name)).id;
  }
  function add() {
    if (!sel || !adding) return;
    sel.items.push(adding);
    adding = '';
    void touch(sel);
  }
  const changed = () => sel && void touch(sel);

  const plan = (r: (typeof rows)[number]) => {
    const piece = r.e!.piece;
    const tl = buildTimeline(piece, sound.speed / 100);
    return { piece, tl, pre: countIn(piece, tl, 0, piece.countIn ?? 0), last: piece.measures.length - 1, title: r.e!.title };
  };

  async function play() {
    if (!sel || !playable.length) return;
    cancelled = false;
    const gap = sel.gap;
    for (const [index, r] of playable.entries()) {
      const { tl, pre, last, title } = plan(r);
      player.onMeasure = (m) => (now = { index, title, measure: m, total: last, gap: false });
      now = { index, title, measure: 0, total: last, gap: false };
      if (!(await player.play(tl, 0, last, false, () => clickOpts(), pre))) continue;
      if (!(await player.whenDone) || cancelled) break;
      if (index < playable.length - 1) {
        now = { index, title: `Next: ${plan(playable[index + 1]).title}`, measure: 0, total: 0, gap: true };
        await new Promise((res) => setTimeout(res, gap * 1000));
        if (cancelled) break;
      }
    }
    now = null;
  }
  function stop() { cancelled = true; player.stop(); now = null; }

  async function exportWav() {
    if (!sel || !playable.length) return;
    busy = true;
    try {
      const job = joinJobs(playable.map((r) => { const { tl, pre, last } = plan(r); return clickEvents(tl, 0, last, clickOpts(), pre); }), sel.gap);
      const warning = longExportWarning(job.seconds);
      if (warning && !confirm(warning)) return;
      const blob = await renderJob(job, (f) => (progress = f));
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${sel.name}.wav` });
      a.click();
      URL.revokeObjectURL(a.href);
    } finally { busy = false; }
  }

  let link = $state<{ id: string; url: string } | null>(null);
  let copied = $state(false);
  async function share() {
    if (!sel) return;
    const items = playable.map((r) => ({ title: r.e!.title, piece: $state.snapshot(r.e!.piece) }));
    link = { id: sel.id, url: await shortLink('playlist', sel.name, await encodePlaylist(sel.name, sel.gap, items)) };
    copied = false;
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link!.url); copied = true; } catch { /* clipboard blocked: the link is selectable */ }
  }

  function drop(p: Playlist) {
    if (!confirm(`Delete playlist "${p.name}"? The pieces stay in your library.`)) return;
    if (selectedId === p.id) selectedId = null;
    void removePlaylist(p.id);
  }
</script>

<dialog bind:this={dialog} aria-label="Playlists" onclose={stop}>
  <div class="head">
    <h3>Playlists</h3>
    <Button size="sm" onclick={() => dialog.close()}>Close</Button>
  </div>

  {#if now}
    <div class="now" role="status" aria-live="polite">
      <p class="mut">{now.gap ? 'Between pieces' : `Playing ${now.index + 1} of ${playable.length}`}</p>
      <p class="title">{now.title}</p>
      {#if !now.gap}<p class="big">Measure {now.measure + 1} <span class="mut">/ {now.total + 1}</span></p>{/if}
      <Button variant="primary" onclick={stop}>Stop</Button>
    </div>
  {:else}
    <div class="row">
      <label>Playlist
        <select bind:value={selectedId}>
          <option value={null}>Choose…</option>
          {#each pl.lists as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
        </select>
      </label>
      <Button onclick={() => void create()}>New playlist</Button>
      {#if sel}<Button onclick={() => drop(sel)}>Delete playlist</Button>{/if}
    </div>

    {#if sel}
      <ol>
        {#each rows as r, i (i)}
          <li>
            <span class="t">{r.e ? r.e.title : '(deleted piece)'} <span class="mut">{r.e ? `${r.e.piece.measures.length} measures` : ''}</span></span>
            <span class="acts">
              <Button size="sm" aria-label="Move up" onclick={() => { move(sel, i, -1); changed(); }}>↑</Button>
              <Button size="sm" aria-label="Move down" onclick={() => { move(sel, i, 1); changed(); }}>↓</Button>
              <Button size="sm" aria-label="Remove from playlist" onclick={() => { sel.items.splice(i, 1); changed(); }}>✕</Button>
            </span>
          </li>
        {/each}
      </ol>
      {#if rows.length === 0}<p class="mut">Nothing in here yet. Add pieces from your library below.</p>{/if}

      <div class="row">
        <label>Add a piece
          <select bind:value={adding} onchange={add}>
            <option value="">Choose…</option>
            {#each lib.entries as e (e.id)}<option value={e.id}>{e.title}</option>{/each}
          </select>
        </label>
        <label>Gap between pieces (s)
          <input type="number" min="0" max="60" bind:value={sel.gap} onchange={changed} />
        </label>
      </div>
      <div class="row">
        <Button variant="primary" disabled={!playable.length} onclick={() => void play()}>Play playlist</Button>
        <Button disabled={!playable.length || busy} onclick={() => void exportWav()}>{busy ? `Rendering… ${Math.round(progress * 100)}%` : 'Export one WAV'}</Button>
        <Button disabled={!playable.length} onclick={() => void share()}>Share playlist</Button>
      </div>
      {#if link?.id === sel.id}
        <div class="link">
          <input readonly aria-label="Share link" value={link.url} onfocus={(ev) => ev.currentTarget.select()} />
          <Button size="sm" onclick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</Button>
          <p class="mut">Contains the markup of every piece, not the PDFs. Whoever opens it attaches their own copies.</p>
        </div>
      {/if}
    {/if}
  {/if}
</dialog>

<style>
  dialog { width: min(560px, calc(100vw - 2 * var(--space-4))); max-height: 85vh; overflow: auto; background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-4); }
  dialog::backdrop { background: var(--scrim); }
  .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); }
  h3 { margin: 0; }
  ol { margin: var(--space-3) 0; padding-left: var(--space-4); display: grid; gap: var(--space-2); }
  li { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); }
  .acts { display: flex; gap: var(--space-1); }
  .row { margin-bottom: var(--space-3); }
  .link { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .link input { flex: 1; min-width: 0; }
  .link .mut { flex-basis: 100%; margin: 0; font-size: var(--font-sm); }
  .now { display: grid; gap: var(--space-2); justify-items: start; }
  .now p { margin: 0; }
  .title { font-size: 1.25rem; font-weight: 700; }
  .big { font-size: 2.5rem; font-weight: 700; }
</style>
