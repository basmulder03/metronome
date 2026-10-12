import { pb } from '../../shared/pb';

export type InviteStatus = 'pending' | 'used' | 'expired' | 'revoked';
export type Invite = { id: string; name: string; email: string; expiresAt: number; usedAt: number; status: InviteStatus; token: string };
export type AdminUser = { id: string; email: string; role: 'user' | 'admin'; blocked: boolean; blockReason: string; created: string; pieces: number };
export type Registration = 'open' | 'invite';

const send = <T>(path: string, method = 'GET', body?: unknown) => pb.send<T>(`/api/metronome/admin/${path}`, { method, ...(body ? { body } : {}) });

// Every one of these is re-checked on the server: hiding the panel from non-admins is a courtesy, not the protection.
export const getSettings = () => send<{ registration: Registration }>('settings');
export const setRegistration = (registration: Registration) => send<{ registration: Registration }>('settings', 'PUT', { registration });
export const listInvites = async () => (await send<{ invites: Invite[] }>('invites')).invites;
export const createInvite = (name: string, email: string, days: number) => send<Invite>('invites', 'POST', { name, email, days });
export const revokeInvite = (id: string) => send(`invites/${id}`, 'DELETE');
export const listUsers = async () => (await send<{ users: AdminUser[] }>('users')).users;
export const blockUser = (id: string, reason: string) => send<AdminUser>(`users/${id}/block`, 'POST', { reason });
export const unblockUser = (id: string) => send<AdminUser>(`users/${id}/unblock`, 'POST');
export const setRole = (id: string, role: 'user' | 'admin') => send<AdminUser>(`users/${id}/role`, 'POST', { role });
export const deleteUser = (id: string) => send(`users/${id}`, 'DELETE');
