<script lang="ts">
  import { app } from '../../shared/store.svelte';
  import { setMark } from './marks';

  const m = $derived(app.selected >= 0 ? app.piece.measures[app.selected] : undefined);
  const k = $derived(m?.marks ?? {});
</script>

{#if m}
  <section>
    <h4>Repeats and jumps</h4>
    <label class="check"><input type="checkbox" checked={!!k.repeatStart} onchange={(e) => setMark(m, 'repeatStart', e.currentTarget.checked)} /> Repeat starts here</label>
    <div class="row">
      <label class="check"><input type="checkbox" checked={!!k.repeatEnd} onchange={(e) => setMark(m, 'repeatEnd', e.currentTarget.checked ? 2 : undefined)} /> Repeat ends here</label>
      {#if k.repeatEnd}
        <label>Plays in total<input type="number" min="2" max="8" value={k.repeatEnd} onchange={(e) => setMark(m, 'repeatEnd', Math.max(2, +e.currentTarget.value || 2))} /></label>
      {/if}
    </div>
    <label>Ending
      <select value={k.volta?.[0] ?? ''} onchange={(e) => setMark(m, 'volta', e.currentTarget.value ? [+e.currentTarget.value] : undefined)}>
        <option value="">Always plays</option>
        <option value="1">1st ending</option>
        <option value="2">2nd ending</option>
        <option value="3">3rd ending</option>
      </select>
    </label>
    <label>Jump after this measure
      <select value={k.jump ?? ''} onchange={(e) => setMark(m, 'jump', (e.currentTarget.value || undefined) as 'dc' | 'ds' | undefined)}>
        <option value="">None</option>
        <option value="dc">D.C. (back to the start)</option>
        <option value="ds">D.S. (back to the segno)</option>
      </select>
    </label>
    <div class="row">
      <label class="check"><input type="checkbox" checked={!!k.segno} onchange={(e) => setMark(m, 'segno', e.currentTarget.checked)} /> Segno</label>
      <label class="check"><input type="checkbox" checked={!!k.fine} onchange={(e) => setMark(m, 'fine', e.currentTarget.checked)} /> Fine</label>
      <label class="check"><input type="checkbox" checked={!!k.toCoda} onchange={(e) => setMark(m, 'toCoda', e.currentTarget.checked)} /> To coda</label>
      <label class="check"><input type="checkbox" checked={!!k.coda} onchange={(e) => setMark(m, 'coda', e.currentTarget.checked)} /> Coda</label>
    </div>
  </section>
{/if}

<style>
  section { border-top: 1px solid var(--border); padding: var(--space-3) 0; display: grid; gap: var(--space-2); }
  h4 { margin: 0 0 var(--space-1); font-size: 13px; color: var(--fg-muted); }
</style>
