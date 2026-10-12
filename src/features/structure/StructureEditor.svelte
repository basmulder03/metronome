<script lang="ts">
  import { app } from '../../shared/store.svelte';
  import { setMark } from './marks';
  import { defaultPartName } from './parts';

  const m = $derived(app.selected >= 0 ? app.piece.measures[app.selected] : undefined);
  const k = $derived(m?.marks ?? {});

  // upbeat (pickup): the last beats of the bar are written. short bar: the first beats are.
  type Part = 'whole' | 'end' | 'start';
  const part = $derived<Part>(k.pickup ? 'end' : k.partial ? 'start' : 'whole');
  const count = $derived(k.pickup ?? k.partial ?? 1);
  function setPart(next: Part) {
    if (!m) return;
    const n = count;
    setMark(m, 'pickup', next === 'end' ? n : undefined);
    setMark(m, 'partial', next === 'start' ? n : undefined);
  }
  // a sheet that holds several parts (movements, sections): a part starts at a marked measure and has a name
  const nextName = $derived(defaultPartName(app.piece.measures, app.selected));
  function startPart(on: boolean) {
    if (m) setMark(m, 'part', on ? { name: nextName } : undefined);
  }
  // endings: a bracket covers several bars that all play on the same passes, so the choice is applied to a run of bars
  const sameVolta = (a?: number[], b?: number[]) => !!a && !!b && a.join() === b.join();
  const endingLength = $derived.by(() => {
    let n = 1;
    while (m && sameVolta(m.marks?.volta, app.piece.measures[app.selected + n]?.marks?.volta) && !app.piece.measures[app.selected + n]?.marks?.repeatStart) n++;
    return n;
  });
  function applyVolta(from: number, len: number, volta: number[] | undefined) {
    for (let i = 0; i < len; i++) { const t = app.piece.measures[from + i]; if (t) setMark(t, 'volta', volta); }
  }
  function togglePass(pass: number, on: boolean) {
    const next = [...new Set([...(k.volta ?? []), ...(on ? [pass] : [])])].filter((p) => on || p !== pass).sort();
    applyVolta(app.selected, endingLength, next.length ? next : undefined);
  }
  function setEndingLength(n: number) {
    if (!k.volta || !(n >= 1)) return;
    const len = Math.floor(n), cur = endingLength;
    applyVolta(app.selected + len, Math.max(0, cur - len), undefined); // shrinking releases the bars cut off
    applyVolta(app.selected, len, k.volta);
  }
  function setCount(n: number) {
    if (!m || !(n >= 1)) return;
    setMark(m, part === 'end' ? 'pickup' : 'partial', n);
  }
</script>

{#if m}
  <section>
    <h4>Parts of this sheet</h4>
    <p class="mut">If one sheet holds several parts (movements, sections), mark where each starts and name it. Playback can then stop after each part, or play straight through.</p>
    <label class="check"><input type="checkbox" checked={!!k.part} onchange={(e) => startPart(e.currentTarget.checked)} /> A new part starts at this measure</label>
    {#if k.part}
      <label>Name of the part
        <input maxlength="80" value={k.part.name} placeholder={nextName}
          oninput={(e) => setMark(m, 'part', { ...k.part!, name: e.currentTarget.value })} />
      </label>
      <label class="check"><input type="checkbox" checked={!!k.part.pause} onchange={(e) => setMark(m, 'part', { ...k.part!, pause: e.currentTarget.checked || undefined })} /> Always stop after this part, even when playing straight through</label>
      <label class="check"><input type="checkbox" checked={!!k.part.restart} onchange={(e) => setMark(m, 'part', { ...k.part!, restart: e.currentTarget.checked || undefined })} /> Bar numbers start again at 1 here</label>
    {/if}
  </section>

  <section>
    <h4>Multi-measure rest</h4>
    <p class="mut">A long rest printed as one box with a number over it stands for that many bars. Enter the number so the click runs for all of them; later boxes then carry the printed bar numbers.</p>
    <div class="row">
      <label>Bars in this rest
        <input type="number" min="1" max="999" placeholder="1" value={k.multirest ?? ''}
          onchange={(e) => setMark(m, 'multirest', +e.currentTarget.value >= 2 ? Math.min(999, Math.floor(+e.currentTarget.value)) : undefined)} />
      </label>
    </div>
  </section>

  <section>
    <h4>Length and holds</h4>
    <p class="mut">For an upbeat, mark the first bar as "only the last beats". A piece that began with one usually ends with a bar that is "only the first beats", which completes it.</p>
    <div class="row">
      <label>Written part of this bar
        <select value={part} onchange={(e) => setPart(e.currentTarget.value as Part)}>
          <option value="whole">The whole bar</option>
          <option value="end">Only the last beats (an upbeat)</option>
          <option value="start">Only the first beats (the bar ends early)</option>
        </select>
      </label>
      {#if part !== 'whole'}
        <label>How many beats are written
          <input type="number" min="1" max="32" value={count} onchange={(e) => setCount(+e.currentTarget.value)} />
        </label>
      {/if}
    </div>
    <div class="row">
      <label class="check"><input type="checkbox" checked={!!k.fermata} onchange={(e) => setMark(m, 'fermata', e.currentTarget.checked ? { beat: 0, factor: 2 } : undefined)} /> Fermata</label>
      {#if k.fermata}
        <label>On beat
          <input type="number" min="1" max="32" value={k.fermata.beat + 1} onchange={(e) => setMark(m, 'fermata', { ...k.fermata!, beat: Math.max(0, (+e.currentTarget.value || 1) - 1) })} />
        </label>
        <label>Hold ×
          <input type="number" min="1" max="8" step="0.5" value={k.fermata.factor} onchange={(e) => setMark(m, 'fermata', { ...k.fermata!, factor: Math.max(1, +e.currentTarget.value || 2) })} />
        </label>
      {/if}
    </div>
  </section>

  <section>
    <h4>Repeats and jumps</h4>
    <label class="check"><input type="checkbox" checked={!!k.repeatStart} onchange={(e) => setMark(m, 'repeatStart', e.currentTarget.checked)} /> Repeat starts here</label>
    <div class="row">
      <label class="check"><input type="checkbox" checked={!!k.repeatEnd} onchange={(e) => setMark(m, 'repeatEnd', e.currentTarget.checked ? 2 : undefined)} /> Repeat ends here</label>
      {#if k.repeatEnd}
        <label>Plays in total<input type="number" min="2" max="8" value={k.repeatEnd} onchange={(e) => setMark(m, 'repeatEnd', Math.max(2, +e.currentTarget.value || 2))} /></label>
      {/if}
    </div>
    <fieldset>
      <legend>Plays on pass (tick several for a bracket like 1. 2.)</legend>
      <div class="row">
        {#each [1, 2, 3, 4] as pass (pass)}
          <label class="check"><input type="checkbox" checked={!!k.volta?.includes(pass)} onchange={(e) => togglePass(pass, e.currentTarget.checked)} /> {pass}{['st', 'nd', 'rd', 'th'][pass - 1]}</label>
        {/each}
      </div>
      {#if k.volta}
        <label>Bars in this ending (from here)
          <input type="number" min="1" max="64" value={endingLength} onchange={(e) => setEndingLength(+e.currentTarget.value)} />
        </label>
      {/if}
    </fieldset>
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
  fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: var(--space-2); }
  legend { font-size: var(--font-sm); color: var(--fg-muted); padding: 0; margin-bottom: var(--space-1); }
  h4 { margin: 0 0 var(--space-1); font-size: 13px; color: var(--fg-muted); }
</style>
