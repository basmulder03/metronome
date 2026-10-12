<script lang="ts">
  import Button from '../../shared/ui/Button.svelte';
  import { lib, rename, remove } from './library.svelte';

  let { onopen, onclose }: { onopen: (id: string) => void; onclose: () => void } = $props();
  let dialog: HTMLDialogElement;

  export function show() { dialog.showModal(); }

  function open(id: string) { dialog.close(); onopen(id); }
  function ask(id: string, title: string) {
    const t = prompt('Rename piece', title);
    if (t) void rename(id, t);
  }
  function drop(id: string, title: string) {
    if (confirm(`Delete "${title}" and its PDF from this device?`)) void remove(id);
  }
</script>

<dialog bind:this={dialog} aria-label="Library" onclose={onclose}>
  <div class="head">
    <h3>Library</h3>
    <Button size="sm" onclick={() => dialog.close()}>Close</Button>
  </div>
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
          <Button size="sm" onclick={() => ask(e.id, e.title)}>Rename</Button>
          <Button size="sm" onclick={() => drop(e.id, e.title)}>Delete</Button>
        </div>
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
  .acts { display: flex; gap: var(--space-2); }
</style>
