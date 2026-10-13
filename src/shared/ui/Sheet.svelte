<script lang="ts">
  import type { Snippet } from 'svelte';
  import { app } from '../store.svelte';

  let { children, hidden = false }: { children: Snippet; hidden?: boolean } = $props();
  const open = $derived(app.selected >= 0 && !hidden);
</script>

<!-- Opens when a measure is picked: a bottom sheet on narrow screens. From 900px wide it is a panel beside the score that is always
     there (so picking a measure never moves the page or covers a box), with a hint while nothing is picked. -->
<aside aria-label="Measure settings" class:open>
  {#if open}
    <button type="button" class="close" aria-label="Close settings" onclick={() => (app.selected = -1)}>✕</button>
    {@render children()}
  {:else}
    <p class="mut hint">Pick a measure to see its settings here.</p>
  {/if}
</aside>

<style>
  aside { display: none; position: fixed; inset: auto 0 var(--bar-h) 0; max-height: 42vh; overflow: auto; padding: var(--space-3); background: var(--bg); border-top: 1px solid var(--border); box-shadow: 0 -4px 12px var(--shadow); z-index: 4; }
  aside.open { display: block; }
  .close { position: absolute; top: var(--space-2); right: var(--space-2); min-height: 32px; min-width: 32px; padding: 0; }
  .hint { margin: 0; }
  @media (min-width: 900px) {
    aside, aside.open { display: block; position: static; max-height: none; height: 100%; overflow: auto; width: 360px; box-shadow: none; border-top: 0; border-left: 1px solid var(--border); }
  }
</style>
