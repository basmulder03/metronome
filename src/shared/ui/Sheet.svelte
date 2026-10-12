<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>

<!-- Bottom sheet on phones, side panel from 900px. -->
<aside>{@render children()}</aside>

<style>
  aside { position: fixed; inset: auto 0 0 0; max-height: 42vh; overflow: auto; padding: var(--space-3); background: var(--bg); border-top: 1px solid var(--border); box-shadow: 0 -4px 12px var(--shadow); z-index: 4; }
  @media (min-width: 900px) {
    aside { position: static; max-height: none; box-shadow: none; border-top: 0; border-left: 1px solid var(--border); }
  }
</style>
