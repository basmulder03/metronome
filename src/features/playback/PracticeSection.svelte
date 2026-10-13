<script lang="ts">
  import Button from '../../shared/ui/Button.svelte';
  import { app } from '../../shared/store.svelte';
  import { barLabels, firstBar } from '../structure/bars';
  import { addSection, removeSection, sectionRange } from '../structure/sections';

  /** Gradually faster laps: each one `step` percent quicker than the last, from `from` up to `to` percent of the written tempo. */
  export type Trainer = { from: number; to: number; step: number };

  // Practice: repeat measures `start..end` until stopped, with a rest between laps, optionally getting faster every lap.
  // `editableEnd`: let the user choose the last measure (one measure selected); otherwise the run is fixed (`last`).
  let { start, last, editableEnd = false, onpractice }: {
    start: number; last: number; editableEnd?: boolean; onpractice: (from: number, to: number, gap: number, trainer?: Trainer) => void;
  } = $props();

  let end = $state(0);
  $effect(() => { end = editableEnd ? Math.max(start, Math.min(end, app.piece.measures.length - 1)) : last; }); // follows the selection, never before it
  let rest = $state(2);
  let train = $state(false);
  let from = $state(70);
  let to = $state(100);
  let step = $state(5);
  const bars = $derived(barLabels(app.piece.measures));
  const name = $derived(`${firstBar(bars[start] ?? '')}${end > start ? `–${firstBar(bars[end] ?? '')}` : ''}`);
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(+n) || lo));
  const go = (a = start, b = end) => onpractice(a, b, Math.min(30, Math.max(0, +rest || 0)), train ? { from: clamp(from, 25, 200), to: clamp(to, 25, 200), step: clamp(step, 1, 50) } : undefined);

  // saved sections: named stretches that stay with the piece
  let sectionName = $state('');
  const sections = $derived((app.piece.sections ?? []).map((s, index) => ({ s, index, range: sectionRange(app.piece, s) })));
  const label = (a: number, b: number) => `${firstBar(bars[a] ?? '')}${b > a ? `–${firstBar(bars[b] ?? '')}` : ''}`;
  function save() {
    addSection(app.piece, sectionName, start, end);
    sectionName = '';
  }
</script>

<details class="sec" open>
  <summary>Practice</summary>
  <p class="mut">Repeats these measures until you press Stop, with a short rest in between.</p>
  <div class="row">
    {#if editableEnd}
      <label>Loop through measure<input type="number" min={start + 1} max={app.piece.measures.length} value={end + 1}
        onchange={(e) => { end = Math.min(app.piece.measures.length - 1, Math.max(start, Math.floor(+e.currentTarget.value) - 1)); e.currentTarget.value = String(end + 1); }} /></label>
    {/if}
    <label>Rest between (s)<input type="number" min="0" max="30" step="0.5" bind:value={rest} /></label>
  </div>
  <label class="check"><input type="checkbox" bind:checked={train} /> Speed up every lap</label>
  {#if train}
    <div class="row">
      <label>Start at %<input type="number" min="25" max="200" bind:value={from} /></label>
      <label>Up to %<input type="number" min="25" max="200" bind:value={to} /></label>
      <label>Faster by %<input type="number" min="1" max="50" bind:value={step} /></label>
    </div>
  {/if}
  <Button variant="primary" onclick={() => go()}>Practise {name}</Button>
  <div class="row">
    <label>Keep this stretch as a section<input bind:value={sectionName} maxlength="80" placeholder="e.g. the hard run" onkeydown={(e) => { if (e.key === 'Enter') save(); }} /></label>
    <Button onclick={save} disabled={!sectionName.trim()}>Save section</Button>
  </div>
  {#if sections.length}
    <ul class="saved">
      {#each sections as { s, index, range } (index)}
        <li>
          <span><strong>{s.name}</strong> <span class="mut">{range ? `measures ${label(range[0], range[1])}` : 'its measures were deleted'}</span></span>
          <span class="acts">
            {#if range}<Button size="sm" onclick={() => go(range[0], range[1])} aria-label="Practise {s.name}">Practise</Button>{/if}
            <Button size="sm" onclick={() => removeSection(app.piece, index)} aria-label="Remove section {s.name}">✕</Button>
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</details>

<style>
  .sec { border-top: 1px solid var(--border); padding: var(--space-2) 0; }
  .sec > :global(:not(summary)) { margin-top: var(--space-2); }
  .saved { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-1); }
  .saved li { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); }
  .acts { display: flex; gap: var(--space-1); }
  summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--fg-muted); min-height: 28px; }
</style>
