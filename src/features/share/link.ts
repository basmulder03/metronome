import { pb } from '../../shared/pb';
import { decodeAny, type Shared } from './codec';

const base = () => `${location.origin}${location.pathname}`;

/** Short links (`#s=code`) point at a copy on the server; long links (`#share=payload`) carry the markup themselves. */
export const hasShareHash = (hash: string) => hash.startsWith('#s=') || hash.startsWith('#share=');

/**
 * Put an encoded share on the server and give back a short link. Without a connection it falls back to the long link,
 * which works on its own, so sharing never fails just because the server is out of reach.
 */
export async function shortLink(kind: 'piece' | 'playlist', title: string, data: string, days = linkDays(), editPiece?: string): Promise<string> {
  try {
    const { code } = await pb.send<{ code: string }>('/api/metronome/share', { method: 'POST', body: { kind, title, data, days, ...(editPiece && { editable: true, pieceId: editPiece }) } });
    return `${base()}#s=${code}`;
  } catch (e) {
    if (editPiece) throw e; // editing together needs the server: no link without one
    return `${base()}#share=${data}`;
  }
}

/** What a share link in the address bar holds, or null when it is invalid, unknown or unreachable. */
export async function openShare(hash: string): Promise<Shared | null> {
  try {
    if (hash.startsWith('#share=')) return await decodeAny(hash.slice(7));
    if (!hash.startsWith('#s=')) return null;
    const code = encodeURIComponent(hash.slice(3));
    const { data, editable, by } = await pb.send<{ data: string; editable?: boolean; by?: string }>(`/api/metronome/share/${code}`, {});
    const shared = await decodeAny(data);
    return shared?.kind === 'piece' && editable ? { ...shared, edit: { code: hash.slice(3), by: by || 'Someone' } } : shared;
  } catch {
    return null;
  }
}

/** How long new links last, in days (0 = until withdrawn). Remembered on this device. */
export const linkDays = () => { try { return Math.max(0, Math.min(365, +(localStorage.getItem('metronome.linkDays') ?? 0) || 0)); } catch { return 0; } };
export const setLinkDays = (days: number) => { try { localStorage.setItem('metronome.linkDays', String(days)); } catch { /* not remembered */ } };

export type MyShare = { code: string; kind: 'piece' | 'playlist'; title: string; created: string; expires: number };
export const myShares = async () => (await pb.send<{ shares: MyShare[] }>('/api/metronome/shares', {})).shares;
export const withdrawShare = (code: string) => pb.send(`/api/metronome/share/${encodeURIComponent(code)}`, { method: 'DELETE' });
export const linkFor = (code: string) => `${base()}#s=${code}`;

/** Become an editor of the piece a link shares for editing (the very same piece, not a copy). Gives the piece's id. */
export const joinShare = (code: string) => pb.send<{ pieceId: string; own: boolean }>(`/api/metronome/share/${encodeURIComponent(code)}/join`, { method: 'POST' });

export type Collab = {
  owned: { record: string; title: string; editors: { id: string; email: string }[] }[];
  joined: { record: string; title: string; owner: string }[];
};
export const collab = () => pb.send<Collab>('/api/metronome/collab', {});
/** The owner removes an editor (`userId`), or an editor leaves (no `userId`). Whoever is removed keeps their own copy. */
export const endEditing = (record: string, userId?: string) => pb.send('/api/metronome/collab/remove', { method: 'POST', body: { record, ...(userId && { userId }) } });
