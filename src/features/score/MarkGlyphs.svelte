<script lang="ts">
  import type { Marks } from '../../shared/types';

  // Repeat signs, endings and jumps drawn the way they look in print, so they read at a glance. Fills the (positioned) box or tile it sits in.
  let { marks, paper = false }: { marks?: Marks; paper?: boolean } = $props();
  const chips = $derived([
    marks?.segno && 'Segno', marks?.coda && 'Coda', marks?.toCoda && 'to Coda', marks?.fine && 'Fine',
    marks?.jump && (marks.jump === 'dc' ? 'D.C.' : 'D.S.'),
  ].filter(Boolean) as string[]);
</script>

{#if marks && (marks.repeatStart || marks.repeatEnd || marks.volta || chips.length)}
  <span class="glyphs" class:paper aria-hidden="true">
    {#if marks.repeatStart}<span class="bar start"></span>{/if}
    {#if marks.repeatEnd}<span class="bar end"></span>{#if marks.repeatEnd > 2}<span class="times">×{marks.repeatEnd}</span>{/if}{/if}
    {#if marks.volta}<span class="volta">{marks.volta.join(',')}.</span>{/if}
    {#if chips.length}<span class="chips">{#each chips as c}<span class="chip">{c}</span>{/each}</span>{/if}
  </span>
{/if}

<style>
  .glyphs { --c: var(--mark); --on-c: var(--accent-fg); position: absolute; inset: 0; pointer-events: none; }
  .glyphs.paper { --c: var(--on-paper-mark); --on-c: var(--paper); }
  /* thick line, thin line and two dots: the repeat barline */
  .bar { position: absolute; top: 0; bottom: 0; width: 12px; border: solid var(--c); border-width: 0 3px; background: radial-gradient(circle, var(--c) 2px, transparent 2.5px) 0 30% / 6px 20% no-repeat, radial-gradient(circle, var(--c) 2px, transparent 2.5px) 0 70% / 6px 20% no-repeat; }
  .bar.start { left: 0; border-right-width: 1px; background-position: 100% 30%, 100% 70%; }
  .bar.end { right: 0; border-left-width: 1px; background-position: 0 30%, 0 70%; }
  .times { position: absolute; right: 14px; bottom: 1px; font-size: 11px; font-weight: 700; color: var(--c); }
  /* the ending bracket along the top */
  .volta { position: absolute; left: 0; right: 0; top: 0; height: 16px; border-top: 2px solid var(--c); border-left: 2px solid var(--c); padding-left: 3px; font-size: 11px; font-weight: 700; line-height: 14px; color: var(--c); }
  .chips { position: absolute; top: 1px; right: 2px; display: flex; gap: 2px; flex-wrap: wrap; justify-content: flex-end; max-width: 90%; }
  .chip { background: var(--c); color: var(--on-c); border-radius: 3px; padding: 0 4px; font-size: 10px; font-weight: 700; line-height: 14px; }
</style>
