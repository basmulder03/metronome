import { ClientResponseError } from 'pocketbase';
import { pb } from '../../shared/pb';

type User = { id: string; email: string };
const fromStore = (): User | null => (pb.authStore.record ? { id: pb.authStore.record.id, email: String(pb.authStore.record.email ?? '') } : null);

/** Signed-in user, or null. Stays set while offline: the session only ends on sign-out or when the server rejects it. */
export const auth = $state({ user: fromStore() });
pb.authStore.onChange(() => (auth.user = fromStore()));

/** Plain-language message for a failed auth request. */
export function authError(e: unknown): string {
  if (e instanceof ClientResponseError) {
    if (e.status === 0) return 'Cannot reach the server. Check your connection and try again.';
    if (e.status === 400 && e.response?.data?.email) return 'That email address is not valid or is already in use.';
    if (e.status === 400 && e.response?.data?.password) return 'Use a password of at least 8 characters.';
    if (e.status === 400) return 'Email or password is incorrect.';
  }
  return 'Something went wrong. Please try again.';
}

export async function signIn(email: string, password: string) {
  await pb.collection('users').authWithPassword(email.trim(), password);
}

export async function register(email: string, password: string) {
  await pb.collection('users').create({ email: email.trim(), password, passwordConfirm: password });
  await signIn(email, password);
}

export const signOut = () => pb.authStore.clear();

/** Renew the token when online; an explicit 401/403 ends the session, a network failure does not. */
export async function refreshSession() {
  if (!pb.authStore.record) return;
  try {
    await pb.collection('users').authRefresh();
  } catch (e) {
    if (e instanceof ClientResponseError && (e.status === 401 || e.status === 403 || e.status === 404)) pb.authStore.clear();
  }
}
