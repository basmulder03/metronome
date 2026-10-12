import { ClientResponseError } from 'pocketbase';
import { pb } from '../../shared/pb';

export type Role = 'user' | 'admin';
type User = { id: string; email: string; role: Role };
const fromStore = (): User | null => {
  const r = pb.authStore.record;
  return r ? { id: r.id, email: String(r.email ?? ''), role: r.role === 'admin' ? 'admin' : 'user' } : null;
};

/** Signed-in user, or null. Stays set while offline: the session only ends on sign-out or when the server rejects it. */
export const auth = $state({ user: fromStore(), notice: '' });
pb.authStore.onChange(() => (auth.user = fromStore()));

/** The server's own plain-language message for a failed request, if it sent one. */
export const serverMessage = (e: unknown): string => (e instanceof ClientResponseError && typeof e.response?.message === 'string' ? e.response.message : '');

/** Plain-language message for a failed sign-in. */
export function authError(e: unknown): string {
  if (e instanceof ClientResponseError) {
    if (e.status === 0) return 'Cannot reach the server. Check your connection and try again.';
    if (e.status === 403) return 'This account has been blocked. Contact the administrator.';
    if (e.status === 400) return 'Email or password is incorrect.';
  }
  return 'Something went wrong. Please try again.';
}

/** Plain-language message for a failed registration (the server explains what is wrong). */
export function registerError(e: unknown): string {
  if (e instanceof ClientResponseError && e.status === 0) return 'Cannot reach the server. Check your connection and try again.';
  return serverMessage(e) || 'Something went wrong. Please try again.';
}

export async function signIn(email: string, password: string) {
  await pb.collection('users').authWithPassword(email.trim(), password);
  auth.notice = '';
}

export type Registration = 'open' | 'invite';

/** How can people join: freely, or only with an invitation. Unknown (offline) counts as invitation, the safe answer. */
export async function loadRegistration(): Promise<Registration> {
  try { return (await pb.send('/api/metronome/config', {})).registration === 'open' ? 'open' : 'invite'; } catch { return 'invite'; }
}

/** Who an invitation is for, or null when it is not valid (forged, expired, used or revoked: the server does not say which). */
export async function inviteInfo(token: string): Promise<{ name: string; email: string } | null> {
  try { return await pb.send(`/api/metronome/invite?token=${encodeURIComponent(token)}`, {}); } catch { return null; }
}

/** Create the account (with an invitation token when there is one), then sign in. */
export async function register(email: string, password: string, invite?: string) {
  await pb.send('/api/metronome/register', { method: 'POST', body: { email, password, invite: invite ?? '' } });
  await signIn(email, password);
}

export const signOut = () => pb.authStore.clear();

/** The server ended the session (removed or blocked account, revoked token): sign out and say so. */
export function endSession() {
  auth.notice = 'You were signed out. If that is unexpected, contact the administrator.';
  pb.authStore.clear();
}

/** Renew the token when online; an explicit 401/403/404 ends the session, a network failure does not. */
export async function refreshSession() {
  if (!pb.authStore.record) return;
  try {
    await pb.collection('users').authRefresh();
  } catch (e) {
    if (e instanceof ClientResponseError && (e.status === 401 || e.status === 403 || e.status === 404)) endSession();
  }
}
