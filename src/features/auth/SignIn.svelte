<script lang="ts">
  import Button from '../../shared/ui/Button.svelte';
  import { authError, register, signIn } from './auth.svelte';

  let { note = '' }: { note?: string } = $props();
  let mode = $state<'in' | 'up'>('in');
  let email = $state('');
  let password = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    busy = true;
    try { await (mode === 'in' ? signIn : register)(email, password); }
    catch (err) { error = authError(err); }
    finally { busy = false; }
  }
</script>

<main class="page">
  <form onsubmit={submit} aria-labelledby="t">
    <h1 id="t">{mode === 'in' ? 'Sign in' : 'Create an account'}</h1>
    <p class="mut">Metronome turns the score you provide into a click track. Your library and playlists follow you across devices; scores themselves never leave your device.</p>
    {#if note}<p class="note">{note}</p>{/if}
    <label>Email<input type="email" autocomplete="email" required bind:value={email} /></label>
    <label>Password<input type="password" autocomplete={mode === 'in' ? 'current-password' : 'new-password'} minlength="8" required bind:value={password} /></label>
    {#if error}<p class="err" role="alert">{error}</p>{/if}
    <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}</Button>
    <button type="button" class="link" onclick={() => { mode = mode === 'in' ? 'up' : 'in'; error = ''; }}>
      {mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
    </button>
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
