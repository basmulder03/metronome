<script lang="ts">
  import Button from '../../shared/ui/Button.svelte';
  import { SHORTCUTS } from './shortcuts';

  let dialog: HTMLDialogElement;
  export function show() { dialog.showModal(); }
</script>

<dialog bind:this={dialog} aria-label="Keyboard shortcuts">
  <div class="head">
    <h3>Keyboard shortcuts</h3>
    <Button size="sm" onclick={() => dialog.close()}>Close</Button>
  </div>
  <p class="mut">Shortcuts pause while you type in a field or have a dialog open. Deleting is always undoable with Ctrl+Z.</p>
  <dl>
    {#each SHORTCUTS as s (s.keys)}
      <dt><kbd>{s.keys}</kbd></dt>
      <dd>{s.does}</dd>
    {/each}
  </dl>
</dialog>

<style>
  dialog { width: min(560px, calc(100vw - 2 * var(--space-4))); max-height: 85vh; overflow: auto; background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-4); }
  dialog::backdrop { background: var(--scrim); }
  .head { display: flex; justify-content: space-between; align-items: center; }
  h3 { margin: 0; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: var(--space-2) var(--space-4); margin: var(--space-3) 0 0; }
  dt { align-self: start; }
  dd { margin: 0; }
  kbd { font: inherit; font-size: var(--font-sm); padding: 2px var(--space-2); border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 6px; background: var(--surface); white-space: nowrap; }
</style>
