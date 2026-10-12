<script lang="ts">
  import Button from '../../shared/ui/Button.svelte';
  import { removeMeasure } from '../score/markup';
  import { defaultGrouping, meterAt, parseGrouping, tempoAt } from './timeline';
  import { DEFAULT_BPM, DEFAULT_UNIT, type Ramp } from '../../shared/types';
  import CurveEditor from './CurveEditor.svelte';
  import { app } from '../../shared/store.svelte';

  let { onplay }: { onplay: (from: number, to: number, loop: boolean) => void } = $props();

  const UNITS = [
    { label: '♩ quarter', den: 4, dotted: false },
    { label: '♪ eighth', den: 8, dotted: false },
    { label: '𝅗𝅥 half', den: 2, dotted: false },
    { label: '♩. dotted quarter', den: 4, dotted: true },
    { label: '♪. dotted eighth', den: 8, dotted: true },
    { label: '𝅗𝅥. dotted half', den: 2, dotted: true },
  ];

  const p = $derived(app.piece);
  const i = $derived(app.selected);
  const meterEv = $derived(p.meters.find((e) => e.at === i));
  const tempoEv = $derived(p.tempos.find((e) => e.at === i));
  const ramp = $derived(p.ramps.find((r) => r.from === i));
  const meter = $derived(meterAt(p, i));
  let groupingText = $state('');
  let groupingBad = $state(false);
  $effect(() => { groupingText = meterEv?.meter.grouping.join('+') ?? ''; groupingBad = false; });

  function addMeter() { p.meters.push({ at: i, meter: { ...meter, grouping: [...meter.grouping] } }); }
  function resize() {
    const m = meterEv!.meter;
    m.grouping = defaultGrouping(m.num, m.den);
    groupingText = m.grouping.join('+');
  }
  function regroup() {
    const g = parseGrouping(groupingText, meterEv!.meter.num);
    groupingBad = !g;
    if (g) meterEv!.meter.grouping = g;
  }
  function addTempo() {
    const t = tempoAt(p, i);
    p.tempos.push({ at: i, bpm: t?.bpm ?? DEFAULT_BPM, unit: { ...(t?.unit ?? DEFAULT_UNIT) } });
  }
  function addRamp(factor: number) {
    const bpm = tempoAt(p, i)?.bpm ?? DEFAULT_BPM;
    const r: Ramp = { from: i, to: Math.min(i + 3, p.measures.length - 1), startBpm: bpm, endBpm: Math.round(bpm * factor), curve: [0.42, 0, 0.58, 1] };
    p.ramps.push(r);
  }
  const unitIndex = (u: { den: number; dotted: boolean }) => UNITS.findIndex((x) => x.den === u.den && x.dotted === u.dotted);
</script>

{#if i >= 0 && p.measures[i]}
  <div class="head">
    <h3>Measure {i + 1}</h3>
    <Button size="sm" onclick={() => { removeMeasure(p, i); app.selected = -1; }}>Delete box</Button>
  </div>
  <p class="mut">In force: {meter.num}/{meter.den} ({meter.grouping.join('+')}) · {tempoAt(p, i)?.bpm ?? DEFAULT_BPM} bpm</p>

  <section>
    <h4>Time signature</h4>
    {#if meterEv}
      <div class="row">
        <label>Beats<input type="number" min="1" max="32" bind:value={meterEv.meter.num} onchange={resize} /></label>
        <label>Note<select bind:value={meterEv.meter.den} onchange={resize}>{#each [1, 2, 4, 8, 16, 32] as d}<option value={d}>{d}</option>{/each}</select></label>
        <label>Grouping<input bind:value={groupingText} onchange={regroup} class:bad={groupingBad} placeholder="2+2+3" /></label>
      </div>
      {#if groupingBad}<p class="err">Grouping must add up to {meterEv.meter.num}.</p>{/if}
      <Button onclick={() => p.meters.splice(p.meters.indexOf(meterEv), 1)}>Remove change</Button>
    {:else}
      <Button onclick={addMeter}>Change time signature here</Button>
    {/if}
  </section>

  <section>
    <h4>Tempo</h4>
    {#if tempoEv}
      <div class="row">
        <label>BPM<input type="number" min="20" max="400" bind:value={tempoEv.bpm} /></label>
        <label>Beat unit
          <select value={unitIndex(tempoEv.unit)} onchange={(e) => { const u = UNITS[+e.currentTarget.value]; tempoEv.unit = { den: u.den, dotted: u.dotted }; }}>
            {#each UNITS as u, k}<option value={k}>{u.label}</option>{/each}
          </select>
        </label>
      </div>
      <Button onclick={() => p.tempos.splice(p.tempos.indexOf(tempoEv), 1)}>Remove tempo</Button>
    {:else}
      <Button onclick={addTempo}>Set tempo here</Button>
    {/if}
  </section>

  <section>
    <h4>Accelerando / rallentando</h4>
    {#if ramp}
      <div class="row">
        <label>Last measure<input type="number" min={i + 1} max={p.measures.length} value={ramp.to + 1}
          onchange={(e) => (ramp.to = Math.min(p.measures.length - 1, Math.max(i, +e.currentTarget.value - 1)))} /></label>
        <label>Start BPM<input type="number" min="20" max="400" bind:value={ramp.startBpm} /></label>
        <label>End BPM<input type="number" min="20" max="400" bind:value={ramp.endBpm} /></label>
      </div>
      <CurveEditor bind:curve={ramp.curve} onchange={() => {}} />
      <div class="row">
        <Button variant="primary" onclick={() => onplay(Math.max(0, i - 1), Math.min(p.measures.length - 1, ramp.to + 1), true)}>Preview (loop, 1 bar around)</Button>
        <Button onclick={() => p.ramps.splice(p.ramps.indexOf(ramp), 1)}>Remove</Button>
      </div>
    {:else}
      <div class="row">
        <Button onclick={() => addRamp(1.25)}>Accelerando from here</Button>
        <Button onclick={() => addRamp(0.75)}>Rallentando from here</Button>
      </div>
    {/if}
  </section>

{:else}
  <p class="mut">Select a measure box to edit its time signature, tempo or accel/rall.</p>
{/if}

<style>
  .head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); }
  h3, h4 { margin: 0 0 4px; }
  h4 { font-size: 13px; color: var(--fg-muted); }
  section { border-top: 1px solid var(--border); padding: 12px 0; display: grid; gap: 8px; }
  .bad { border-color: var(--danger); }
</style>
