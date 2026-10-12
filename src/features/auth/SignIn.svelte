<script lang="ts">
  import Button from '../../shared/ui/Button.svelte';
  import { auth, authError, inviteInfo, loadRegistration, register, registerError, signIn, type Registration } from './auth.svelte';

  let { note = '', invite = null, onjoined = () => {} }: { note?: string; invite?: string | null; onjoined?: () => void } = $props();

  // svelte-ignore state_referenced_locally -- the page reads the invitation once, when it is shown
  let registration = $state<Registration | null>(null); // null until the server has answered
  // svelte-ignore state_referenced_locally
  let invited = $state<{ name: string; email: string } | null | 'checking'>(invite ? 'checking' : null);
  let mode = $state<'in' | 'up'>('in');
  let email = $state('');
  let password = $state('');
  let error = $state('');
  let busy = $state(false);

  void loadRegistration().then((r) => (registration = r));
  // svelte-ignore state_referenced_locally
  if (invite) {
    // svelte-ignore state_referenced_locally
    void inviteInfo(invite).then((i) => {
      invited = i;
      if (i) email = i.email; // an invitation can be tied to an address
    });
  }

  const joining = $derived(typeof invited === 'object' && invited !== null); // a valid invitation is being used
  const signingUp = $derived(joining || mode === 'up');

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    busy = true;
    try {
      if (signingUp) { await register(email, password, joining ? (invite ?? undefined) : undefined); onjoined(); }
      else await signIn(email, password);
    } catch (err) { error = signingUp ? registerError(err) : authError(err); }
    finally { busy = false; }
  }
</script>

<main class="page">
  <form onsubmit={submit} aria-labelledby="t">
    <h1 id="t">{joining ? 'Join Metronome' : signingUp ? 'Create an account' : 'Sign in'}</h1>
    {#if joining && typeof invited === 'object' && invited}
      <p class="note">Hi {invited.name}, you have been invited. Choose a password to create your account.</p>
    {:else}
      <p class="mut">Metronome turns the score you provide into a click track. Your library and playlists follow you across devices; scores themselves never leave your device.</p>
    {/if}
    {#if invited === null && invite}<p class="note" role="alert">This invitation is not valid, has expired or was already used. You can still sign in below.</p>{/if}
    {#if auth.notice}<p class="note" role="status">{auth.notice}</p>{/if}
    {#if note}<p class="note">{note}</p>{/if}
    <label>Email<input type="email" autocomplete="email" required bind:value={email} readonly={joining && !!invited && typeof invited === 'object' && !!invited.email} /></label>
    <label>Password<input type="password" autocomplete={signingUp ? 'new-password' : 'current-password'} minlength="8" maxlength="72" required bind:value={password} /></label>
    {#if error}<p class="err" role="alert">{error}</p>{/if}
    <Button type="submit" variant="primary" disabled={busy || invited === 'checking'}>{busy ? 'Please wait…' : signingUp ? 'Create account' : 'Sign in'}</Button>
    {#if !joining && registration === 'open'}
      <button type="button" class="link" onclick={() => { mode = mode === 'in' ? 'up' : 'in'; error = ''; }}>
        {mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
      </button>
    {:else if !joining && registration === 'invite'}
      <p class="mut">New accounts are by invitation only. Ask the administrator for an invitation link.</p>
    {/if}
  </form>
</main>

<style>
  .page { min-height: 100vh; display: grid; place-items: center; padding: var(--space-4); }
  form { width: min(380px, 100%); display: grid; gap: var(--space-3); }
  h1 { margin: 0; font-size: 1.5rem; }
  .mut { margin: 0; }
  .note { margin: 0; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
  .link { background: none; border: 0; color: var(--accent); text-decoration: underline; justify-self: start; min-height: var(--tap); padding: 0; }
</style>
