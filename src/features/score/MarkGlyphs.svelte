<script lang="ts">
  import type { Marks } from '../../shared/types';
  import type { Block } from '../structure/blocks';
  import type { Chip } from '../structure/jumps';

  // Repeat signs, endings and jumps drawn the way they look in print, so they read at a glance. Fills the (positioned) box or tile it sits in.
  let { marks, blocks = [], chips = [], paper = false }: { marks?: Marks; blocks?: Block[]; chips?: Chip[]; paper?: boolean } = $props();
</script>

{#if blocks.length || (marks && (marks.repeatStart || marks.repeatEnd)) || chips.length}
  <span class="glyphs" class:paper aria-hidden="true">
    {#each blocks as b, k}
      <span class="block {b.kind}" class:first={b.first} class:last={b.last} style:--k={k} style:--bc="var({paper ? '--on-paper-mark-' : '--mark-'}{b.color})">{#if b.first && b.label}<span class="label">{b.label}</span>{/if}</span>
    {/each}
    {#if marks?.repeatStart}<span class="bar start"></span>{/if}
    {#if marks?.repeatEnd}<span class="bar end"></span>{/if}
    {#if chips.length}<span class="chips">{#each chips as c}<span class="chip" class:warn={c.warn}>{c.text}</span>{/each}</span>{/if}
  </span>
{/if}

<style>
  .glyphs { --c: var(--mark); --on-c: var(--accent-fg); position: absolute; inset: 0; pointer-events: none; }
  .glyphs.paper { --c: var(--on-paper-mark); --on-c: var(--paper); }
  /* thick line, thin line and two dots: the repeat barline */
  .bar { position: absolute; top: 0; bottom: 0; width: 12px; border: solid var(--c); border-width: 0 3px; background: radial-gradient(circle, var(--c) 2px, transparent 2.5px) 0 30% / 6px 20% no-repeat, radial-gradient(circle, var(--c) 2px, transparent 2.5px) 0 70% / 6px 20% no-repeat; }
  .bar.start { left: 0; border-right-width: 1px; background-position: 100% 30%, 100% 70%; }
  .bar.end { right: 0; border-left-width: 1px; background-position: 0 30%, 0 70%; }
  /* one continuous line per block along the top, stacked when blocks overlap; it reaches across the gap to the next box */
  .glyphs { --reach: var(--space-2); }
  .glyphs.paper { --reach: 0px; }
  .block { position: absolute; left: 0; right: calc(var(--reach) * -1); top: calc(-5px - var(--k) * 6px); height: 0; border-top: 3px solid var(--bc); }
  .block.last { right: 0; }
  .block.ending { border-top-width: 2px; }
  /* an ending is a bracket: ticks down at its ends */
  .block.ending.first::before, .block.ending.last::after { content: ''; position: absolute; top: 0; height: 9px; border-left: 2px solid var(--bc); }
  .block.ending.first::before { left: 0; }
  .block.ending.last::after { right: 0; }
  .label { position: absolute; left: 14px; top: calc(100% + 3px); font-size: 11px; font-weight: 700; line-height: 1; color: var(--bc); }
  /* jumps: big filled badges below the bar number, so the route through the piece stands out */
  .chips { position: absolute; left: 14px; right: 4px; top: 16px; display: flex; gap: 3px; flex-wrap: wrap; justify-content: flex-end; }
  .chip { background: var(--c); color: var(--on-c); border-radius: 4px; padding: 1px 6px; font-size: 12px; font-weight: 700; line-height: 16px; box-shadow: 0 0 0 1.5px var(--on-c) inset; }
  .chip.warn { background: var(--danger); }
</style>
