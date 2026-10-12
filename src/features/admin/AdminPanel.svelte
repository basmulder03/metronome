<script lang="ts">
  import { auth, serverMessage } from '../auth/auth.svelte';
  import { inviteLink } from '../auth/invite';
  import Button from '../../shared/ui/Button.svelte';
  import Segmented from '../../shared/ui/Segmented.svelte';
  import * as api from './api';
  import QrCode from './QrCode.svelte';

  let dialog: HTMLDialogElement;
  let tab = $state<'invites' | 'users' | 'settings'>('invites');
  let registration = $state<api.Registration>('invite');
  let invites = $state<api.Invite[]>([]);
  let users = $state<api.AdminUser[]>([]);
  let error = $state('');
  let shown = $state<string | null>(null); // invite whose QR is open
  let copied = $state('');
  let name = $state('');
  let email = $state('');
  let days = $state(7);

  export async function show() {
    dialog.showModal();
    await refresh();
  }

  /** Run an admin call and report the server's message if it refuses. */
  async function run<T>(f: () => Promise<T>): Promise<T | undefined> {
    error = '';
    try { return await f(); } catch (e) { error = serverMessage(e) || 'That did not work. Try again.'; }
  }
  async function refresh() {
    await run(async () => {
      [registration, invites, users] = await Promise.all([api.getSettings().then((s) => s.registration), api.listInvites(), api.listUsers()]);
    });
  }

  async function create(e: SubmitEvent) {
    e.preventDefault();
    const made = await run(() => api.createInvite(name, email, days));
    if (!made) return;
    name = ''; email = '';
    await refresh();
    shown = made.id;
  }
  async function setMode(m: api.Registration) {
    if (await run(() => api.setRegistration(m))) registration = m;
  }
  async function copy(token: string) {
    try { await navigator.clipboard.writeText(inviteLink(token)); copied = token; } catch { /* the link is also shown to select */ }
  }
  async function block(u: api.AdminUser) {
    const reason = prompt(`Block ${u.email}? They are signed out at once and cannot sign in. Reason (only admins see it):`, '');
    if (reason === null) return;
    await run(() => api.blockUser(u.id, reason));
    await refresh();
  }
  async function remove(u: api.AdminUser) {
    if (!confirm(`Delete ${u.email} and all their pieces and playlists? This cannot be undone.`)) return;
    await run(() => api.deleteUser(u.id));
    await refresh();
  }
  const act = (f: () => Promise<unknown>) => async () => { await run(f); await refresh(); };
  const when = (s: number) => new Date(s * 1000).toLocaleDateString();
  const label: Record<api.InviteStatus, string> = { pending: 'Waiting', used: 'Used', expired: 'Expired', revoked: 'Revoked' };
</script>

<dialog bind:this={dialog} aria-label="Administration">
  <div class="head">
    <h3>Administration</h3>
    <Button size="sm" onclick={() => dialog.close()}>Close</Button>
  </div>
  <Segmented bind:value={tab} options={[{ value: 'invites', label: 'Invitations' }, { value: 'users', label: 'Users' }, { value: 'settings', label: 'Settings' }]} />
  {#if error}<p class="err" role="alert">{error}</p>{/if}

  {#if tab === 'invites'}
    <form class="row" onsubmit={create}>
      <label>Name<input required maxlength="100" bind:value={name} placeholder="Who is it for?" /></label>
      <label>Email (optional)<input type="email" bind:value={email} placeholder="locks it to this address" /></label>
      <label>Valid for
        <select bind:value={days}><option value={1}>1 day</option><option value={7}>7 days</option><option value={30}>30 days</option></select>
      </label>
      <Button type="submit" variant="primary">Create invitation</Button>
    </form>
    <p class="mut">No email is sent. Show the QR code or copy the link and hand it over yourself. Each invitation works once.</p>
    <ul>
      {#each invites as i (i.id)}
        <li>
          <div class="line">
            <span class="who"><strong>{i.name}</strong>{#if i.email} <span class="mut">{i.email}</span>{/if}</span>
            <span class="badge {i.status}">{label[i.status]}</span>
            <span class="mut">{i.status === 'used' ? `used ${when(i.usedAt)}` : `until ${when(i.expiresAt)}`}</span>
            {#if i.status === 'pending'}
              <Button size="sm" aria-label="Show QR code for {i.name}" onclick={() => (shown = shown === i.id ? null : i.id)}>QR code</Button>
              <Button size="sm" aria-label="Revoke invitation for {i.name}" onclick={act(() => api.revokeInvite(i.id))}>Revoke</Button>
            {/if}
          </div>
          {#if shown === i.id && i.token}
            <div class="qrbox">
              <QrCode text={inviteLink(i.token)} label="QR code of the invitation for {i.name}" />
              <div class="linkbox">
                <input readonly aria-label="Invitation link for {i.name}" value={inviteLink(i.token)} onfocus={(e) => e.currentTarget.select()} />
                <Button size="sm" onclick={() => void copy(i.token)}>{copied === i.token ? 'Copied' : 'Copy link'}</Button>
                <p class="mut">Anyone with this link can create one account until it is used or expires. Treat it like a key.</p>
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    {#if !invites.length}<p class="mut">No invitations yet.</p>{/if}

  {:else if tab === 'users'}
    <ul>
      {#each users as u (u.id)}
        <li>
          <div class="line">
            <span class="who"><strong>{u.email}</strong> <span class="mut">{u.pieces} pieces</span></span>
            {#if u.role === 'admin'}<span class="badge admin">Admin</span>{/if}
            {#if u.blocked}<span class="badge blocked">Blocked</span>{/if}
            {#if u.id !== auth.user?.id}
              {#if u.blocked}
                <Button size="sm" aria-label="Unblock {u.email}" onclick={act(() => api.unblockUser(u.id))}>Unblock</Button>
              {:else}
                <Button size="sm" aria-label="Block {u.email}" onclick={() => void block(u)}>Block</Button>
              {/if}
              <Button size="sm" aria-label="{u.role === 'admin' ? 'Remove admin rights from' : 'Make admin'} {u.email}" onclick={act(() => api.setRole(u.id, u.role === 'admin' ? 'user' : 'admin'))}>{u.role === 'admin' ? 'Remove admin' : 'Make admin'}</Button>
              <Button size="sm" aria-label="Delete {u.email}" onclick={() => void remove(u)}>Delete</Button>
            {:else}
              <span class="mut">(you)</span>
            {/if}
          </div>
          {#if u.blocked && u.blockReason}<p class="mut reason">Reason: {u.blockReason}</p>{/if}
        </li>
      {/each}
    </ul>

  {:else}
    <fieldset>
      <legend>Who can create an account?</legend>
      <label class="check"><input type="radio" name="reg" checked={registration === 'invite'} onchange={() => void setMode('invite')} /> Invitation only</label>
      <label class="check"><input type="radio" name="reg" checked={registration === 'open'} onchange={() => void setMode('open')} /> Anyone can register</label>
      <p class="mut">Invitations work in both modes. With open registration anyone may also sign up without one, so keep an eye on the user list.</p>
    </fieldset>
  {/if}
</dialog>

<style>
  dialog { width: min(680px, calc(100vw - 2 * var(--space-4))); max-height: 88vh; overflow: auto; background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-4); }
  dialog::backdrop { background: var(--scrim); }
  .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); }
  h3 { margin: 0; }
  form.row { margin: var(--space-3) 0; }
  ul { list-style: none; margin: var(--space-3) 0; padding: 0; display: grid; gap: var(--space-2); }
  li { border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-2) var(--space-3); }
  .line { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
  .who { margin-right: auto; overflow-wrap: anywhere; }
  .badge { font-size: var(--font-sm); padding: 2px var(--space-2); border: 1px solid var(--border); border-radius: 999px; }
  .badge.pending, .badge.admin { border-color: var(--accent); }
  .badge.blocked, .badge.revoked { border-color: var(--danger); color: var(--danger); }
  .qrbox { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-2); }
  .linkbox { flex: 1; min-width: 220px; display: grid; gap: var(--space-2); align-content: start; }
  .linkbox input { width: 100%; }
  .reason { margin: var(--space-1) 0 0; }
  fieldset { border: 1px solid var(--border); border-radius: var(--radius); margin: var(--space-3) 0; display: grid; gap: var(--space-2); }
</style>
