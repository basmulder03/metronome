<script lang="ts">
  import App from './App.svelte';
  import { auth, refreshSession } from './features/auth/auth.svelte';
  import { inviteFromHash } from './features/auth/invite';
  import SignIn from './features/auth/SignIn.svelte';
  import { hasShareHash, openShare } from './features/share/link';
  import GuestView from './features/share/GuestView.svelte';
  import type { Piece } from './shared/types';

  void refreshSession();

  // an invitation link (#invite=...) is for signed-out visitors; it is removed from the address once it has been used
  let invite = $state(inviteFromHash(location.hash));
  const joined = () => { history.replaceState(null, '', location.pathname + location.search); invite = null; };

  // A share link opened while signed out is shown read-only; signing in then offers to import it.
  // (a shared playlist has no read-only view: signing in offers to import it)
  let guest = $state<{ title: string; piece: Piece } | null>(null);
  let listTitle = $state('');
  const startsDecoding = hasShareHash(location.hash) && !auth.user;
  let decoding = $state(startsDecoding);
  let invalid = $state(false);
  let wantsSignIn = $state(false);
  if (startsDecoding) {
    void openShare(location.hash).then((g) => {
      if (g?.kind === 'piece') guest = g;
      else if (g) listTitle = g.title;
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
  <SignIn invite={invite} onjoined={joined} note={guest ? `Sign in to save a copy of “${guest.title}”.` : listTitle ? `Sign in to save a copy of the playlist “${listTitle}”.` : invalid ? 'That share link is not valid.' : ''} />
{/if}

<style>
  .loading { padding: var(--space-4); color: var(--fg-muted); }
</style>
