<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  let { variant = 'default', size = 'md', children, ...rest }: HTMLButtonAttributes & {
    variant?: 'default' | 'primary';
    size?: 'md' | 'sm';
    children: Snippet;
  } = $props();
</script>

<button type="button" class="{variant} {size}" {...rest}>{@render children()}</button>

<style>
  .primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
  button { min-width: var(--tap); }
  .sm { padding: var(--space-1) var(--space-2); min-height: 32px; font-size: 13px; }
  button[aria-pressed='true'] { outline: 2px solid var(--accent); }
</style>
