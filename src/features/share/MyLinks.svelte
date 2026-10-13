<script lang="ts">
  import Button from '../../shared/ui/Button.svelte';
  import { linkDays, linkFor, myShares, setLinkDays, withdrawShare, type MyShare } from './link';

  let dialog: HTMLDialogElement;
  let list = $state<MyShare[] | null>(null);
  let note = $state('');
  let days = $state(linkDays());
  let copied = $state('');

  export async function show() {
    dialog.showModal();
    await load();
  }
  async function load() {
    note = '';
    try { list = await myShares(); } catch { list = []; note = 'Could not load your links (offline?).'; }
  }
  async function revoke(s: MyShare) {
    if (!confirm(`Withdraw the link to “${s.title}”? Anyone who has it can no longer open it.`)) return;
    try { await withdrawShare(s.code); await load(); } catch { note = 'Could not withdraw it. Try again.'; }
  }
  async function copy(s: MyShare) {
    try { await navigator.clipboard.writeText(linkFor(s.code)); copied = s.code; } catch { /* the link is shown, select it by hand */ }
  }
  const lifetime = (s: MyShare) => (!s.expires ? 'until withdrawn' : s.expires * 1000 < Date.now() ? 'expired' : `until ${new Date(s.expires * 1000).toLocaleDateString()}`);
</script>

<dialog bind:this={dialog} aria-label="My links">
  <div class="head"><h3>My share links</h3><Button size="sm" onclick={() => dialog.close()}>Close</Button></div>
  <label>New links stay valid for
    <select bind:value={days} onchange={() => setLinkDays(+days)}>
      <option value={0}>Until I withdraw them</option>
      <option value={7}>7 days</option>
      <option value={30}>30 days</option>
      <option value={365}>A year</option>
    </select>
  </label>
  {#if note}<p class="mut" role="status">{note}</p>{/if}
  {#if list && !list.length}<p class="mut">You have not shared anything yet.</p>{/if}
  <ul>
    {#each list ?? [] as s (s.code)}
      <li>
        <div class="t"><strong>{s.title || 'Untitled'}</strong><span class="mut">{s.kind === 'playlist' ? 'Playlist' : 'Piece'} · {linkFor(s.code).split('#')[1]} · {lifetime(s)}</span></div>
        <span class="acts">
          <Button size="sm" onclick={() => void copy(s)}>{copied === s.code ? 'Copied' : 'Copy link'}</Button>
          <Button size="sm" onclick={() => void revoke(s)}>Withdraw</Button>
        </span>
      </li>
    {/each}
  </ul>
</dialog>

<style>
  dialog { width: min(560px, calc(100vw - 2 * var(--space-4))); max-height: 80vh; overflow: auto; background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-4); }
  dialog::backdrop { background: var(--scrim); }
  .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); }
  h3 { margin: 0; }
  ul { list-style: none; margin: var(--space-3) 0 0; padding: 0; display: grid; gap: var(--space-2); }
  li { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: space-between; align-items: center; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius); }
  .t { display: grid; min-width: 0; }
  .acts { display: flex; gap: var(--space-2); }
</style>
