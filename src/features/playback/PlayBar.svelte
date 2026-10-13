<script lang="ts">
  import Button from '../../shared/ui/Button.svelte';
  import { app } from '../../shared/store.svelte';
  import { barLabels, firstBar } from '../structure/bars';
  import { partIndexOf, partsOf } from '../structure/parts';
  import { KIT_NAMES, type Kit, type Pattern } from './audio';
  import { beat, saveSound, sound } from './sound.svelte';

  // Always at the bottom: transport, a bar that shows where the click is in the piece and can be dragged to any measure, and the sound options.
  // `position`: the measure plus how far through it (4.5 = halfway through the fifth box). `onseek(measure, final)`: `final` once the finger lets go.
  let { playing, position, onplay, onstop, onseek }: {
    playing: boolean; position: number; onplay: () => void; onstop: () => void; onseek: (measure: number, final: boolean) => void;
  } = $props();

  const n = $derived(app.piece.measures.length);
  const bars = $derived(barLabels(app.piece.measures));
  const here = $derived(Math.min(Math.max(0, Math.round(position)), Math.max(0, n - 1)));
  const pct = (at: number) => (n > 1 ? (Math.min(Math.max(at, 0), n - 1) / (n - 1)) * 100 : 0);
  const fill = $derived(pct(position)); // the fill and the thumb both use this, so they always meet
  const parts = $derived(partsOf(app.piece.measures));
  const part = $derived(parts[partIndexOf(parts, here)]);
  const label = $derived(n ? `Measure ${firstBar(bars[here] ?? String(here + 1))} of ${n}${part ? ` · ${part.name}` : ''}` : 'No measures yet');

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
  {#if sound.flash}<span class="dot" class:on={beat.accent >= 0} class:down={beat.accent === 2} aria-hidden="true"></span>{/if}
  <div class="seek">
    <div class="track" aria-hidden="true">
      <div class="fill" style:width="{fill}%"></div>
      {#each parts.filter((p) => p.start > 0) as p (p.index)}<span class="part" style:left="{pct(p.start)}%" title={p.name}></span>{/each}
    </div>
    <input type="range" min="0" max={Math.max(0, n - 1)} step="1" value={here} disabled={n < 2} aria-label="Position in the piece" aria-valuetext={label}
      oninput={(e) => onseek(+e.currentTarget.value, false)} onchange={(e) => onseek(+e.currentTarget.value, true)} />
    <span class="thumb" aria-hidden="true" style:--at={fill}></span>
  </div>
  <span class="where" aria-live="off">{label}{sound.speed !== 100 ? ` · ${sound.speed}%` : ''}</span>
  <details class="sound">
    <summary>Sound</summary>
    <div class="panel">
      <label>Click pattern
        <select bind:value={sound.pattern} onchange={saveSound}>{#each PATTERNS as p}<option value={p.value}>{p.label}</option>{/each}</select>
      </label>
      <label>Sound
        <select bind:value={sound.kit} onchange={saveSound}>{#each Object.entries(KIT_NAMES) as [k, name]}<option value={k as Kit}>{name}</option>{/each}</select>
      </label>
      <label class="check"><input type="checkbox" bind:checked={sound.flash} onchange={saveSound} /> Flash a dot on every beat</label>
      <label class="check"><input type="checkbox" bind:checked={sound.vibrate} onchange={saveSound} /> Vibrate on every beat (phones and tablets)</label>
      <label>Silent bars
        <select bind:value={sound.silent} onchange={saveSound}>
          <option value="off">None: the click plays throughout</option>
          <option value="alternate">Every other bar is silent</option>
          <option value="fourth">Every fourth bar is silent</option>
        </select>
      </label>
      <label>Speed {sound.speed}%
        <input type="range" min="25" max="200" step="5" bind:value={sound.speed} onchange={saveSound} />
      </label>
      <label>Volume {Math.round(sound.volume * 100)}%
        <input type="range" min="0" max="1" step="0.05" bind:value={sound.volume} onchange={saveSound} />
      </label>
    </div>
  </details>
</div>

<style>
  .bar { position: fixed; inset: auto 0 0 0; height: var(--bar-h); z-index: 7; display: flex; align-items: center; gap: var(--space-3); padding: 0 var(--space-3); padding-bottom: env(safe-area-inset-bottom); background: var(--bg); border-top: 1px solid var(--border); box-shadow: 0 -2px 8px var(--shadow); }
  .seek { position: relative; flex: 1; min-width: 80px; height: var(--tap); display: grid; align-items: center; --r: 11px; }
  /* the track starts and ends at the thumb's centre at each end, so the fill, the part marks and the thumb all share one scale */
  .track { position: absolute; left: var(--r); right: var(--r); top: 50%; height: 8px; margin-top: -4px; border-radius: 4px; background: var(--surface); border: 1px solid var(--border); }
  .fill { height: 100%; background: var(--accent); border-radius: 4px; }
  .part { position: absolute; top: -6px; bottom: -6px; width: 2px; margin-left: -1px; background: var(--mark); border-radius: 1px; }
  .thumb { position: absolute; top: 50%; left: calc(var(--r) + (100% - 2 * var(--r)) * var(--at) / 100); width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: var(--accent); border: 3px solid var(--bg); box-shadow: 0 0 0 1px var(--accent); pointer-events: none; }
  /* the real slider sits on top, see-through, so the whole bar is a big touch target and the keyboard still works */
  .seek input { position: relative; width: 100%; height: var(--tap); margin: 0; background: transparent; appearance: none; touch-action: none; }
  .seek input::-webkit-slider-runnable-track { background: transparent; height: var(--tap); }
  .seek input::-moz-range-track { background: transparent; height: var(--tap); }
  .seek input::-webkit-slider-thumb { appearance: none; width: 22px; height: 22px; margin-top: 9px; border: 0; background: transparent; }
  .seek input::-moz-range-thumb { width: 22px; height: 22px; border: 0; background: transparent; }
  .seek input:focus-visible + .thumb { outline: 2px solid var(--fg); outline-offset: 2px; }
  .where { font-size: var(--font-sm); color: var(--fg-muted); white-space: nowrap; }
  .sound { position: relative; }
  .sound summary { cursor: pointer; list-style: none; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-2) var(--space-3); min-height: var(--tap); display: inline-flex; align-items: center; }
  .sound .panel { position: absolute; right: 0; bottom: calc(100% + var(--space-2)); display: grid; gap: var(--space-3); width: min(340px, calc(100vw - 2 * var(--space-3))); padding: var(--space-3); background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 4px 12px var(--shadow); }
  @media (max-width: 520px) { .where { display: none; } }
</style>
