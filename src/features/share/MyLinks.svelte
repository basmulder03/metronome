<script lang="ts">
  import Button from '../../shared/ui/Button.svelte';
  import { collab, endEditing, linkDays, linkFor, myShares, setLinkDays, withdrawShare, type Collab, type MyShare } from './link';

  let dialog: HTMLDialogElement;
  let list = $state<MyShare[] | null>(null);
  let note = $state('');
  let days = $state(linkDays());
  let copied = $state('');
  let together = $state<Collab>({ owned: [], joined: [] });

  export async function show() {
    dialog.showModal();
    await load();
  }
  async function load() {
    note = '';
    try { list = await myShares(); together = await collab(); } catch { list = []; note = 'Could not load your links (offline?).'; }
  }
  async function revoke(s: MyShare) {
    if (!confirm(`Withdraw the link to “${s.title}”? Anyone who has it can no longer open it.`)) return;
    try { await withdrawShare(s.code); await load(); } catch { note = 'Could not withdraw it. Try again.'; }
  }
  async function copy(s: MyShare) {
    try { await navigator.clipboard.writeText(linkFor(s.code)); copied = s.code; } catch { /* the link is shown, select it by hand */ }
  }
  async function stop(record: string, userId?: string) {
    if (!confirm(userId ? 'Stop this person editing the piece?' : 'Stop editing this piece together? You keep your own copy.')) return;
    try { await endEditing(record, userId); await load(); } catch { note = 'Could not do that. Try again.'; }
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
  {#if together.owned.length || together.joined.length}
    <h4>Editing together</h4>
    <ul>
      {#each together.owned as p (p.record)}
        <li>
          <div class="t"><strong>{p.title || 'Untitled'}</strong><span class="mut">You own it. Also editing: {p.editors.map((x) => x.email).join(', ')}</span></div>
          <span class="acts">{#each p.editors as ed (ed.id)}<Button size="sm" onclick={() => void stop(p.record, ed.id)} aria-label="Stop {ed.email} editing {p.title}">Remove {ed.email.split('@')[0]}</Button>{/each}</span>
        </li>
      {/each}
      {#each together.joined as p (p.record)}
        <li>
          <div class="t"><strong>{p.title || 'Untitled'}</strong><span class="mut">Owned by {p.owner}. You edit it with them.</span></div>
          <span class="acts"><Button size="sm" onclick={() => void stop(p.record)} aria-label="Leave {p.title}">Leave</Button></span>
        </li>
      {/each}
    </ul>
    <p class="mut">Whoever is removed (or leaves) keeps their own copy of the piece on their device and account.</p>
  {/if}
</dialog>

<style>
  dialog { width: min(560px, calc(100vw - 2 * var(--space-4))); max-height: 80vh; overflow: auto; background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-4); }
  dialog::backdrop { background: var(--scrim); }
  .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); }
  h3 { margin: 0; }
  h4 { margin: var(--space-4) 0 0; }
  ul { list-style: none; margin: var(--space-3) 0 0; padding: 0; display: grid; gap: var(--space-2); }
  li { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: space-between; align-items: center; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius); }
  .t { display: grid; min-width: 0; }
  .acts { display: flex; gap: var(--space-2); }
</style>
