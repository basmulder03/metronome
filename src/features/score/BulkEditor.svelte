<script lang="ts">
  import Button from '../../shared/ui/Button.svelte';
  import { app, selectedRange } from '../../shared/store.svelte';
  import { barLabels } from '../structure/bars';
  import { clearRepeatsOver, removeRange, setEndingOver, setMeterOver, setTempoOver } from './bulk';
  import { tempoAt } from '../tempo-map/timeline';
  import { DEFAULT_BPM } from '../../shared/types';
  import PracticeSection, { type Trainer } from '../playback/PracticeSection.svelte';

  let { onpractice }: { onpractice: (from: number, to: number, gap: number, trainer?: Trainer) => void } = $props();

  // Several measures picked with Shift+click: one change for all of them.
  const range = $derived(selectedRange() ?? [app.selected, app.selected]);
  const [from, to] = $derived(range);
  const bars = $derived(barLabels(app.piece.measures));
  const count = $derived(to - from + 1);
  const what = $derived(`${bars[from]}–${bars[to]}`);

  let beats = $state(4);
  let note = $state(4);
  let bpm = $state(DEFAULT_BPM);
  let message = $state('');
  $effect(() => { bpm = tempoAt(app.piece, from)?.bpm ?? DEFAULT_BPM; });

  const done = (m: string) => (message = m);
  function removeAll() {
    if (!confirm(`Delete the ${count} measure boxes ${what}?`)) return;
    removeRange(app.piece, from, to);
    app.selected = Math.min(from, app.piece.measures.length - 1);
    app.extent = -1;
  }
</script>

<div class="head">
  <h3>Measures {what}</h3>
  <Button size="sm" onclick={() => (app.extent = -1)}>Just the first</Button>
</div>
<p class="mut">{count} measures selected. Shift+click another measure to change the run.</p>
{#if message}<p role="status" class="mut">{message}</p>{/if}

<details class="sec" open>
  <summary>Time signature</summary>
  <div class="row">
    <label>Beats<input type="number" min="1" max="32" bind:value={beats} /></label>
    <label>Note<select bind:value={note}>{#each [1, 2, 4, 8, 16, 32] as d}<option value={d}>{d}</option>{/each}</select></label>
  </div>
  <Button onclick={() => { if (beats >= 1) { setMeterOver(app.piece, from, to, Math.floor(beats), note); done(`Set ${beats}/${note} for ${what}.`); } }}>Apply to these measures</Button>
</details>

<details class="sec" open>
  <summary>Tempo</summary>
  <div class="row"><label>BPM<input type="number" min="20" max="400" bind:value={bpm} /></label></div>
  <Button onclick={() => { if (bpm >= 20) { setTempoOver(app.piece, from, to, bpm); done(`Set ${bpm} bpm for ${what}.`); } }}>Apply to these measures</Button>
</details>

<details class="sec" open>
  <summary>Endings and repeats</summary>
  <div class="row">
    <Button onclick={() => setEndingOver(app.piece, from, to, [1])}>1st ending</Button>
    <Button onclick={() => setEndingOver(app.piece, from, to, [2])}>2nd ending</Button>
    <Button onclick={() => setEndingOver(app.piece, from, to, [1, 2])}>1st and 2nd</Button>
    <Button onclick={() => setEndingOver(app.piece, from, to)}>No ending</Button>
  </div>
  <Button onclick={() => { clearRepeatsOver(app.piece, from, to); done(`Cleared repeats and jumps in ${what}.`); }}>Clear all repeats and jumps</Button>
</details>

<PracticeSection start={from} last={to} {onpractice} />

<div class="sec"><Button onclick={removeAll}>Delete these {count} boxes</Button></div>

<style>
  .head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); }
  h3 { margin: 0 0 4px; }
  .sec { border-top: 1px solid var(--border); padding: var(--space-2) 0; }
  .sec > :global(:not(summary)) { margin-top: var(--space-2); }
  summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--fg-muted); min-height: 28px; }
</style>
