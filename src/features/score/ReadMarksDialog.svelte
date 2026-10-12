<script lang="ts">
  import Button from '../../shared/ui/Button.svelte';
  import type { Suggestion } from './readmarks';

  let { suggestions, onapply, oncancel }: { suggestions: Suggestion[]; onapply: (chosen: Suggestion[]) => void; oncancel: () => void } = $props();
  let dialog: HTMLDialogElement;
  // everything the reader was sure about starts ticked; guesses (rit. end tempos, guessed beat units) start unticked
  // svelte-ignore state_referenced_locally -- the dialog is mounted fresh for each batch of suggestions
  let ticked = $state(new Set(suggestions.filter((s) => !s.low).map((s) => s.id)));

  export function show() { dialog.showModal(); }

  const where = (s: Suggestion) => (s.kind === 'ramp' ? `Measures ${s.from + 1}–${s.to + 1}` : `Measure ${s.measure + 1}`);
  const kind = (s: Suggestion) => ({ meter: 'Time signature', tempo: 'Tempo', ramp: 'Accel./rall.' })[s.kind];
  const toggle = (id: string, on: boolean) => { const n = new Set(ticked); on ? n.add(id) : n.delete(id); ticked = n; };
  const chosen = $derived(suggestions.filter((s) => ticked.has(s.id)));
</script>

<dialog bind:this={dialog} aria-label="Read from PDF" onclose={oncancel}>
  <h3>Found in the PDF</h3>
  <p class="mut">Tick what to add. Anything you already set is kept. Items marked “check” are guesses (for example the tempo a rit. ends on); fine-tune them in the editor afterwards.</p>
  <ul>
    {#each suggestions as s (s.id)}
      <li>
        <label class="check">
          <input type="checkbox" checked={ticked.has(s.id)} onchange={(e) => toggle(s.id, e.currentTarget.checked)} />
          <span class="what"><strong>{where(s)}</strong> · {kind(s)}: {s.text}{#if s.low} <em class="warn">check</em>{/if}</span>
        </label>
      </li>
    {/each}
  </ul>
  <div class="row">
    <Button variant="primary" disabled={!chosen.length} onclick={() => { dialog.close(); onapply(chosen); }}>Add {chosen.length} selected</Button>
    <Button onclick={() => dialog.close()}>Cancel</Button>
  </div>
</dialog>

<style>
  dialog { width: min(560px, calc(100vw - 2 * var(--space-4))); max-height: 85vh; overflow: auto; background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-4); }
  dialog::backdrop { background: var(--scrim); }
  h3 { margin: 0 0 var(--space-2); }
  ul { list-style: none; margin: var(--space-3) 0; padding: 0; display: grid; gap: var(--space-1); }
  .what { overflow-wrap: anywhere; }
  .warn { color: var(--warn-text); font-style: normal; font-size: var(--font-sm); }
</style>
