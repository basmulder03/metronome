<script lang="ts">
  import { app } from '../../shared/store.svelte';
  import { barLabels } from '../structure/bars';
  import { boxLabel, inRamp } from './labels';

  const bars = $derived(barLabels(app.piece.measures));

  // Without a PDF the piece is shown as a grid of measure tiles: pick one to start from, the playing one lights up.
  $effect(() => {
    if (app.playing >= 0) document.querySelector('.tile.playing')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
</script>

<div class="strip" role="group" aria-label="Measures">
  {#each app.piece.measures as m, i (m.id)}
    <button type="button" class="tile" aria-pressed={i === app.selected} aria-label="{bars[i].includes('–') ? 'Measures' : 'Measure'} {bars[i]}" class:sel={i === app.selected} class:playing={i === app.playing} class:ramp={inRamp(app.piece, i)} onclick={() => (app.selected = i)}>
      <span class="n">{bars[i]}</span>
      <span class="tag">{boxLabel(app.piece, i)}</span>
    </button>
  {/each}
</div>

<style>
  .strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: var(--space-2); }
  .tile { min-height: 64px; display: grid; align-content: space-between; justify-items: start; text-align: left; padding: var(--space-2); transition: background 0.12s; }
  .n { font-weight: 700; }
  .tag { font-size: var(--font-sm); color: var(--fg-muted); overflow-wrap: anywhere; }
  .ramp { border-color: var(--warn); }
  .sel { outline: 2px solid var(--accent); }
  .playing { background: var(--accent); color: var(--accent-fg); }
  .playing .tag { color: inherit; }
</style>
