<script lang="ts">
  import App from './App.svelte';
  import { auth, refreshSession } from './features/auth/auth.svelte';
  import SignIn from './features/auth/SignIn.svelte';
  import { codeFromHash, decodeShare } from './features/share/codec';
  import GuestView from './features/share/GuestView.svelte';
  import type { Piece } from './shared/types';

  void refreshSession();

  // A share link opened while signed out is shown read-only; signing in then offers to import it.
  const code = codeFromHash(location.hash);
  let guest = $state<{ title: string; piece: Piece } | null>(null);
  const startsDecoding = !!code && !auth.user;
  let decoding = $state(startsDecoding);
  let invalid = $state(false);
  let wantsSignIn = $state(false);
  if (startsDecoding) {
    void decodeShare(code!).then((g) => {
      guest = g;
      invalid = !g;
      decoding = false;
    });
  }
</script>

<!-- Creating and editing needs an account; the {#key} remounts the app (and its per-user storage) when the account changes. -->
{#if auth.user}
  {#key auth.user.id}<App userId={auth.user.id} />{/key}
{:else if decoding}
  <p class="loading">Loading…</p>
{:else if guest && !wantsSignIn}
  <GuestView title={guest.title} piece={guest.piece} onsignin={() => (wantsSignIn = true)} />
{:else}
  <SignIn note={guest ? `Sign in to save a copy of “${guest.title}”.` : invalid ? 'That share link is not valid.' : ''} />
{/if}

<style>
  .loading { padding: var(--space-4); color: var(--fg-muted); }
</style>
