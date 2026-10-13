<script lang="ts">
  import Button from '../../shared/ui/Button.svelte';
  import { app } from '../../shared/store.svelte';
  import { barLabels, firstBar } from '../structure/bars';
  import { KIT_NAMES, type Kit, type Pattern } from './audio';
  import { saveSound, sound } from './sound.svelte';

  // Always at the bottom: transport, a bar that shows where the click is in the piece and can be dragged to any measure, and the sound options.
  // `position`: the measure plus how far through it (4.5 = halfway through the fifth box). `onseek(measure, final)`: `final` once the finger lets go.
  let { playing, position, onplay, onstop, onseek }: {
    playing: boolean; position: number; onplay: () => void; onstop: () => void; onseek: (measure: number, final: boolean) => void;
  } = $props();

  const n = $derived(app.piece.measures.length);
  const bars = $derived(barLabels(app.piece.measures));
  const here = $derived(Math.min(Math.max(0, Math.round(position)), Math.max(0, n - 1)));
  const fill = $derived(n > 1 ? (Math.min(Math.max(position, 0), n - 1) / (n - 1)) * 100 : 0);
  const label = $derived(n ? `Measure ${firstBar(bars[here] ?? String(here + 1))} of ${n}` : 'No measures yet');

  const PATTERNS: { value: Pattern; label: string }[] = [
    { value: 'groups', label: 'Beats and groups (1 2 2 2)' },
    { value: 'all', label: 'Every beat, subdivisions soft (1 3 3 2 3 3…)' },
    { value: 'even', label: 'Group beats, all equal (1 1 1 1)' },
    { value: 'bar', label: 'Start of the bar only (1)' },
  ];
</script>

<div class="bar" role="group" aria-label="Playback">
  {#if playing}
    <Button variant="primary" onclick={onstop}>Stop</Button>
  {:else}
    <Button variant="primary" onclick={onplay} aria-label={app.selected >= 0 ? `Play from ${firstBar(bars[app.selected] ?? String(app.selected + 1))}` : 'Play'}>Play</Button>
  {/if}
  <div class="seek">
    <div class="track" aria-hidden="true"><div class="fill" style:width="{fill}%"></div></div>
    <input type="range" min="0" max={Math.max(0, n - 1)} step="1" value={here} disabled={n < 2} aria-label="Position in the piece" aria-valuetext={label}
      oninput={(e) => onseek(+e.currentTarget.value, false)} onchange={(e) => onseek(+e.currentTarget.value, true)} />
  </div>
  <span class="where" aria-live="off">{label}</span>
  <details class="sound">
    <summary>Sound</summary>
    <div class="panel">
      <label>Click pattern
        <select bind:value={sound.pattern} onchange={saveSound}>{#each PATTERNS as p}<option value={p.value}>{p.label}</option>{/each}</select>
      </label>
      <label>Sound
        <select bind:value={sound.kit} onchange={saveSound}>{#each Object.entries(KIT_NAMES) as [k, name]}<option value={k as Kit}>{name}</option>{/each}</select>
      </label>
      <label>Volume {Math.round(sound.volume * 100)}%
        <input type="range" min="0" max="1" step="0.05" bind:value={sound.volume} onchange={saveSound} />
      </label>
    </div>
  </details>
</div>

<style>
  .bar { position: fixed; inset: auto 0 0 0; height: var(--bar-h); z-index: 7; display: flex; align-items: center; gap: var(--space-3); padding: 0 var(--space-3); padding-bottom: env(safe-area-inset-bottom); background: var(--bg); border-top: 1px solid var(--border); box-shadow: 0 -2px 8px var(--shadow); }
  .seek { position: relative; flex: 1; min-width: 80px; height: var(--tap); display: grid; align-items: center; }
  .track { position: absolute; left: 0; right: 0; top: 50%; height: 8px; margin-top: -4px; border-radius: 4px; background: var(--surface); border: 1px solid var(--border); overflow: hidden; }
  .fill { height: 100%; background: var(--accent); }
  /* the real slider sits on top, see-through, so the whole bar is a big touch target and the keyboard still works */
  .seek input { position: relative; width: 100%; height: var(--tap); margin: 0; background: transparent; appearance: none; touch-action: none; }
  .seek input::-webkit-slider-runnable-track { background: transparent; height: var(--tap); }
  .seek input::-moz-range-track { background: transparent; height: var(--tap); }
  .seek input::-webkit-slider-thumb { appearance: none; width: 22px; height: 22px; margin-top: 9px; border-radius: 50%; background: var(--accent); border: 3px solid var(--bg); box-shadow: 0 0 0 1px var(--accent); }
  .seek input::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: var(--accent); border: 3px solid var(--bg); }
  .where { font-size: var(--font-sm); color: var(--fg-muted); white-space: nowrap; }
  .sound { position: relative; }
  .sound summary { cursor: pointer; list-style: none; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-2) var(--space-3); min-height: var(--tap); display: inline-flex; align-items: center; }
  .sound .panel { position: absolute; right: 0; bottom: calc(100% + var(--space-2)); display: grid; gap: var(--space-3); width: min(340px, calc(100vw - 2 * var(--space-3))); padding: var(--space-3); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 4px 12px var(--shadow); }
  @media (max-width: 520px) { .where { display: none; } }
</style>
