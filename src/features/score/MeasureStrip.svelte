<script lang="ts">
  import { app } from '../../shared/store.svelte';
  import { barLabels, barsIn, firstBar } from '../structure/bars';
  import { boxLabel, inRamp } from './labels';
  import MarkGlyphs from './MarkGlyphs.svelte';

  const bars = $derived(barLabels(app.piece.measures));
  // Another player's part has other rests, so without the PDF a multi-measure rest is written out as one plain tile per bar, not labelled as a rest.
  const tiles = $derived(app.piece.measures.flatMap((m, i) =>
    Array.from({ length: barsIn(m) }, (_, k) => ({ i, k, id: `${m.id}.${k}`, bar: String(+firstBar(bars[i]) + k) }))));

  // Without a PDF the piece is shown as a grid of measure tiles: pick one to start from, the playing one lights up.
  $effect(() => {
    if (app.playing >= 0) document.querySelector('.tile.playing')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
</script>

<div class="strip" role="group" aria-label="Measures">
  {#each tiles as { i, k, id, bar } (id)}
    <button type="button" class="tile" aria-pressed={i === app.selected} aria-label="Measure {bar}" class:sel={i === app.selected} class:playing={i === app.playing} class:ramp={inRamp(app.piece, i)} onclick={() => (app.selected = i)}>
      {#if k === 0}<MarkGlyphs marks={app.piece.measures[i].marks} />{/if}
      <span class="n">{bar}</span>
      <span class="tag">{k === 0 ? boxLabel(app.piece, i, false) : ''}</span>
    </button>
  {/each}
</div>

<style>
  .strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: var(--space-2); }
  .tile { position: relative; min-height: 64px; display: grid; align-content: space-between; justify-items: start; text-align: left; padding: var(--space-2); transition: background 0.12s; }
  .n { font-weight: 700; }
  .tag { font-size: var(--font-sm); color: var(--fg-muted); overflow-wrap: anywhere; }
  .ramp { border-color: var(--warn); }
  .sel { outline: 2px solid var(--accent); }
  .playing { background: var(--accent); color: var(--accent-fg); }
  .playing .tag { color: inherit; }
</style>
