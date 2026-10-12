<script lang="ts">
  import type { Snippet } from 'svelte';
  import { app } from '../store.svelte';

  let { children, hidden = false }: { children: Snippet; hidden?: boolean } = $props();
</script>

<!-- Opens when a measure is picked: a bottom sheet on phones, a card in the bottom corner on larger screens. The score keeps the picked box above it. -->
{#if app.selected >= 0 && !hidden}
  <aside aria-label="Measure settings">
    <button type="button" class="close" aria-label="Close settings" onclick={() => (app.selected = -1)}>✕</button>
    {@render children()}
  </aside>
{/if}

<style>
  aside { position: fixed; inset: auto 0 0 0; max-height: 42vh; overflow: auto; padding: var(--space-3); background: var(--bg); border-top: 1px solid var(--border); box-shadow: 0 -4px 12px var(--shadow); z-index: 4; }
  .close { position: absolute; top: var(--space-2); right: var(--space-2); min-height: 32px; min-width: 32px; padding: 0; }
  @media (min-width: 900px) {
    aside { inset: auto var(--space-3) var(--space-3) auto; width: 360px; max-height: min(55vh, 560px); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 6px 20px var(--shadow); }
  }
</style>
