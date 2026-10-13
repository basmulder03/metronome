<script lang="ts">
  import Button from '../../shared/ui/Button.svelte';
  import { removeMeasure } from '../score/markup';
  import { tapBpm } from './tap';
  import { defaultGrouping, maxRampEnd, meterAt, parseGrouping, rampCovering, tempoAt } from './timeline';
  import { DEFAULT_BPM, DEFAULT_UNIT, type Ramp } from '../../shared/types';
  import { barHeading, barLabels } from '../structure/bars';
  import CurveEditor from './CurveEditor.svelte';
  import PracticeSection, { type Trainer } from '../playback/PracticeSection.svelte';
  import { app } from '../../shared/store.svelte';

  let { onplay, onpractice }: { onplay: (from: number, to: number, loop: boolean) => void; onpractice: (from: number, to: number, gap: number, trainer?: Trainer) => void } = $props();

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
  const bars = $derived(barLabels(p.measures));
  const meterEv = $derived(p.meters.find((e) => e.at === i));
  const tempoEv = $derived(p.tempos.find((e) => e.at === i));
  const ramp = $derived(p.ramps.find((r) => r.from === i));
  const meter = $derived(meterAt(p, i));
  let groupingText = $state('');
  let groupingBad = $state(false);
  $effect(() => { groupingText = meterEv?.meter.grouping.join('+') ?? ''; groupingBad = false; });

  function addMeter() { p.meters.push({ at: i, meter: { ...meter, grouping: [...meter.grouping] } }); }
  // These run on "change", which fires when a field loses focus: by then the selection may have moved on and the section is gone.
  function resize() {
    const m = meterEv?.meter;
    if (!m) return;
    m.grouping = defaultGrouping(m.num, m.den);
    groupingText = m.grouping.join('+');
  }
  function regroup() {
    const ev = meterEv;
    if (!ev) return;
    const g = parseGrouping(groupingText, ev.meter.num);
    groupingBad = !g;
    if (g) ev.meter.grouping = g;
  }
  let taps: number[] = [];
  /** Tap in time with the music; sets this measure's BPM. */
  function tap() {
    taps = [...taps.slice(-9), performance.now()];
    const bpm = tapBpm(taps);
    if (bpm && tempoEv) tempoEv.bpm = bpm;
  }
  function addTempo() {
    const t = tempoAt(p, i);
    p.tempos.push({ at: i, bpm: t?.bpm ?? DEFAULT_BPM, unit: { ...(t?.unit ?? DEFAULT_UNIT) } });
  }
  const enclosing = $derived(rampCovering(p, i)); // a ramp that already runs through this measure
  function addRamp(factor: number) {
    const bpm = tempoAt(p, i)?.bpm ?? DEFAULT_BPM;
    const r: Ramp = { from: i, to: Math.min(i + 3, maxRampEnd(p, i)), startBpm: bpm, endBpm: Math.round(bpm * factor), curve: [0.42, 0, 0.58, 1] };
    p.ramps.push(r);
  }
  const unitIndex = (u: { den: number; dotted: boolean }) => UNITS.findIndex((x) => x.den === u.den && x.dotted === u.dotted);
</script>

{#if i >= 0 && p.measures[i]}
  <div class="head">
    <h3>{barHeading(bars[i])}</h3>
    <Button size="sm" onclick={() => { removeMeasure(p, i); app.selected = -1; }}>Delete box</Button>
  </div>
  <p class="mut">In force: {meter.num}/{meter.den} ({meter.grouping.join('+')}) · {tempoAt(p, i)?.bpm ?? DEFAULT_BPM} bpm</p>

  <details class="sec" open>
    <summary>Time signature</summary>
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
  </details>

  <details class="sec" open>
    <summary>Tempo</summary>
    {#if tempoEv}
      <div class="row">
        <label>BPM<input type="number" min="20" max="400" bind:value={tempoEv.bpm} /></label>
        <label>Beat unit
          <select value={unitIndex(tempoEv.unit)} onchange={(e) => { const u = UNITS[+e.currentTarget.value]; if (tempoEv) tempoEv.unit = { den: u.den, dotted: u.dotted }; }}>
            {#each UNITS as u, k}<option value={k}>{u.label}</option>{/each}
          </select>
        </label>
      </div>
      <div class="row">
        <Button onclick={tap} title="Tap in time with the music">Tap tempo</Button>
        <Button onclick={() => p.tempos.splice(p.tempos.indexOf(tempoEv), 1)}>Remove tempo</Button>
      </div>
    {:else}
      <Button onclick={addTempo}>Set tempo here</Button>
    {/if}
  </details>

  <details class="sec" open>
    <summary>Accelerando / rallentando</summary>
    {#if ramp}
      <div class="row">
        <label>Last measure<input type="number" min={i + 1} max={maxRampEnd(p, i) + 1} value={ramp.to + 1}
          onchange={(e) => { if (!ramp) return; ramp.to = Math.min(maxRampEnd(p, i), Math.max(i, +e.currentTarget.value - 1)); e.currentTarget.value = String(ramp.to + 1); }} /></label>
        <label>Start BPM<input type="number" min="20" max="400" bind:value={ramp.startBpm} /></label>
        <label>End BPM<input type="number" min="20" max="400" bind:value={ramp.endBpm} /></label>
      </div>
      <CurveEditor bind:curve={ramp.curve} />
      <div class="row">
        <Button variant="primary" onclick={() => onplay(Math.max(0, i - 1), Math.min(p.measures.length - 1, ramp.to + 1), true)}>Preview (loop, 1 bar around)</Button>
        <Button onclick={() => p.ramps.splice(p.ramps.indexOf(ramp), 1)}>Remove</Button>
      </div>
    {:else if enclosing}
      <p class="mut">Measure {i + 1} is already part of the ramp from measure {enclosing.from + 1} to {enclosing.to + 1}. Pick measure {enclosing.from + 1} to change it.</p>
    {:else}
      <div class="row">
        <Button onclick={() => addRamp(1.25)}>Accelerando from here</Button>
        <Button onclick={() => addRamp(0.75)}>Rallentando from here</Button>
      </div>
    {/if}
  </details>

  <PracticeSection start={i} last={i} editableEnd {onpractice} />

  <details class="sec" open>
    <summary>Several measures at once</summary>
    <label>Edit several: through measure
      <input type="number" min={i + 2} max={p.measures.length} placeholder="Or Shift+click on a computer"
        onchange={(e) => { const n = Math.floor(+e.currentTarget.value); if (n > i + 1 && n <= p.measures.length) app.extent = n - 1; e.currentTarget.value = ''; }} />
    </label>
  </details>

{:else}
  <p class="mut">Pick a measure to set its time signature, tempo or accel./rall.</p>
{/if}

<style>
  .head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); }
  h3 { margin: 0 0 4px; }
  .sec { border-top: 1px solid var(--border); padding: var(--space-2) 0; }
  .sec > :global(:not(summary)) { margin-top: var(--space-2); }
  summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--fg-muted); min-height: 28px; }
  .bad { border-color: var(--danger); }
</style>
