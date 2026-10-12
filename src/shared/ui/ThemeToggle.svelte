<script lang="ts">
  import Button from './Button.svelte';
  import { applyTheme, getTheme, nextTheme } from './theme';

  let theme = $state(getTheme());
  const label = { system: 'Auto', light: 'Light', dark: 'Dark' };
  function cycle() { theme = nextTheme(theme); applyTheme(theme); }
</script>

<Button onclick={cycle} aria-label="Theme: {theme}" title="Theme: {theme} (click to change)">{label[theme]}</Button>
