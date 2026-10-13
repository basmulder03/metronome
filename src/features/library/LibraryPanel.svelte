<script lang="ts">
  import Button from '../../shared/ui/Button.svelte';
  import { encodeShare } from '../share/codec';
  import { shortLink } from '../share/link';
  import { exportBackup, parseBackup } from './backup';
  import { attachPdf, create, duplicate, lib, rename, remove } from './library.svelte';

  let { onopen, onreplace }: { onopen: (id: string) => void; onreplace: (id: string, pdf: Blob) => void } = $props();
  let dialog: HTMLDialogElement;

  export function show() { dialog.showModal(); }

  function open(id: string) { dialog.close(); onopen(id); }
  function ask(id: string, title: string) {
    const t = prompt('Rename piece', title);
    if (t) void rename(id, t);
  }
  let link = $state<{ id: string; url: string } | null>(null);
  let copied = $state(false);
  async function share(id: string) {
    const e = lib.entries.find((x) => x.id === id);
    if (!e) return;
    link = { id, url: await shortLink('piece', e.title, await encodeShare(e.title, $state.snapshot(e.piece))) };
    copied = false;
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link!.url); copied = true; } catch { /* clipboard blocked: the link is selectable */ }
  }
  function saveBackup() {
    const blob = new Blob([exportBackup($state.snapshot(lib.entries))], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'metronome-backup.json' });
    a.click();
    URL.revokeObjectURL(a.href);
  }
  let note = $state('');
  async function loadBackup(input: HTMLInputElement) {
    const f = input.files?.[0];
    if (!f) return;
    const text = await f.text(); // read before the input is cleared
    input.value = '';
    const pieces = parseBackup(text);
    if (!pieces) { note = 'That file is not a Metronome backup.'; return; }
    for (const p of pieces) await create(p.title, undefined, p.piece);
    note = `Imported ${pieces.length} piece${pieces.length === 1 ? '' : 's'}. Attach your PDFs to them from the list.`;
  }
  async function swapPdf(id: string, input: HTMLInputElement) {
    const f = input.files?.[0];
    if (!f) return;
    const blob = new Blob([await f.arrayBuffer()], { type: 'application/pdf' }); // read before the input is cleared
    input.value = '';
    await attachPdf(id, blob);
    onreplace(id, blob);
  }
  function drop(id: string, title: string) {
    // sync makes a delete global: it also removes the piece, and the PDF saved there, on your other devices
    if (confirm(`Delete "${title}" from all your devices? The PDF saved with it on each device is deleted too, and cannot be recovered.`)) void remove(id);
  }
</script>

<dialog bind:this={dialog} aria-label="Library">
  <div class="head">
    <h3>Library</h3>
    <div class="acts">
      <Button size="sm" onclick={saveBackup} disabled={!lib.entries.length} title="Save the markup of every piece as a file (no PDFs) to import on another server">Export all</Button>
      <label class="swap" title="Add the pieces from a backup file">Import file<input type="file" accept="application/json,.json" hidden onchange={(ev) => void loadBackup(ev.currentTarget)} /></label>
      <Button size="sm" onclick={() => dialog.close()}>Close</Button>
    </div>
  </div>
  {#if note}<p class="mut" role="status">{note}</p>{/if}
  {#if lib.entries.length === 0}
    <p class="mut">Nothing saved yet. Open a PDF to create your first piece.</p>
  {/if}
  <ul>
    {#each lib.entries as e (e.id)}
      <li class:current={e.id === lib.currentId}>
        <div class="title">
          <strong>{e.title}</strong>
          <span class="mut">{e.piece.measures.length} measures{e.hasPdf ? '' : ' · no PDF attached'}</span>
        </div>
        <div class="acts">
          <Button size="sm" variant="primary" onclick={() => open(e.id)}>Open</Button>
          <Button size="sm" onclick={() => void share(e.id)} disabled={e.piece.measures.length === 0}>Share</Button>
          <Button size="sm" onclick={() => ask(e.id, e.title)}>Rename</Button>
          <Button size="sm" onclick={() => void duplicate(e.id)} title="Copy the tempos, meters and boxes under a new name, without the PDF, to use the same click track for another part">Duplicate</Button>
          <label class="swap" title="Use a different PDF for this piece (for example another part). Run Auto-detect afterwards: your tempos and time signatures are kept.">
            {e.hasPdf ? 'Replace PDF' : 'Attach PDF'}<input type="file" accept="application/pdf" hidden onchange={(ev) => void swapPdf(e.id, ev.currentTarget)} />
          </label>
          <Button size="sm" onclick={() => drop(e.id, e.title)}>Delete</Button>
        </div>
        {#if link?.id === e.id}
          <div class="link">
            <input readonly aria-label="Share link" value={link.url} onfocus={(ev) => ev.currentTarget.select()} />
            <Button size="sm" onclick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</Button>
            <p class="mut">Contains the markup only, not the PDF. Whoever opens it attaches their own copy.</p>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
</dialog>

<style>
  dialog { width: min(560px, calc(100vw - 2 * var(--space-4))); max-height: 80vh; overflow: auto; background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-4); }
  dialog::backdrop { background: var(--scrim); }
  .head { display: flex; justify-content: space-between; align-items: center; }
  h3 { margin: 0; }
  ul { list-style: none; margin: var(--space-3) 0 0; padding: 0; display: grid; gap: var(--space-2); }
  li { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: space-between; align-items: center; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius); }
  li.current { border-color: var(--accent); }
  .title { display: grid; min-width: 0; }
  .acts { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .swap { flex-direction: row; align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-1) var(--space-2); min-height: 32px; font-size: 13px; color: var(--fg); cursor: pointer; }
  .link { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .link input { flex: 1; min-width: 0; }
  .link .mut { flex-basis: 100%; margin: 0; font-size: var(--font-sm); }
</style>
