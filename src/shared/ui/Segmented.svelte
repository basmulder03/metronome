<script lang="ts" generics="T extends string">
  import Button from './Button.svelte';

  let { options, value = $bindable() }: { options: { value: T; label: string; title?: string }[]; value: T } = $props();
</script>

<span class="seg" role="group">
  {#each options as o}
    <Button aria-pressed={value === o.value} title={o.title} onclick={() => (value = o.value)}>{o.label}</Button>
  {/each}
</span>

<style>
  .seg { display: flex; gap: var(--space-2); }
</style>
