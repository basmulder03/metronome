<script lang="ts">
  import { app, choose } from '../../shared/store.svelte';
  import { barLabels, firstBar } from '../structure/bars';
  import { blocksOf } from '../structure/blocks';
  import { chipsOf } from '../structure/jumps';
  import { partsOf } from '../structure/parts';
  import { boxLabel, inRamp } from './labels';
  import MarkGlyphs from './MarkGlyphs.svelte';

  const bars = $derived(barLabels(app.piece.measures));
  // One tile per box. Another player's part has other rests, so a multi-measure rest is not spelled out or marked: it is a tile like any other.
  const parts = $derived(partsOf(app.piece.measures));
  const blocks = $derived(blocksOf(app.piece.measures));
  const chips = $derived(chipsOf(app.piece.measures, bars));

  // Without a PDF the piece is shown as a grid of measure tiles: pick one to start from, the playing one lights up.
  $effect(() => {
    if (app.playing >= 0) document.querySelector('.tile.playing')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
</script>

<div class="strip" role="group" aria-label="Measures">
  {#each app.piece.measures as m, i (m.id)}
    {#each parts.filter((p) => p.start === i) as p (p.index)}<h4 class="part">{p.name}</h4>{/each}
    <button type="button" class="tile" aria-pressed={i === app.selected} aria-label="Measure {firstBar(bars[i])}" class:sel={i === app.selected} class:range={i > app.selected && i <= app.extent} class:playing={i === app.playing} class:ramp={inRamp(app.piece, i)} onclick={(e) => choose(i, e.shiftKey)}>
      <MarkGlyphs marks={m.marks} blocks={blocks[i]} chips={chips[i]} />
      <span class="n">{firstBar(bars[i])}</span>
      <span class="tag">{boxLabel(app.piece, i, false)}</span>
    </button>
  {/each}
</div>

<style>
  .strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: var(--space-2); }
  .part { grid-column: 1 / -1; margin: var(--space-3) 0 0; font-size: var(--font-md); } /* a part starts a new row, with its name above */
  .part:first-child { margin-top: 0; }
  .strip { row-gap: var(--space-4); }
  .tile { position: relative; min-height: 96px; display: grid; align-content: space-between; justify-items: start; text-align: left; padding: var(--space-2); transition: background 0.12s; }
  .n { font-weight: 700; }
  .tag { font-size: var(--font-sm); color: var(--fg-muted); overflow-wrap: anywhere; }
  .ramp { border-color: var(--warn); }
  .range { outline: 2px dashed var(--accent); }
  .sel { outline: 2px solid var(--accent); }
  .playing { background: var(--accent); color: var(--accent-fg); }
  .playing .tag { color: inherit; }
</style>
