import { pb } from '../../shared/pb';
import { decodeAny, type Shared } from './codec';

const base = () => `${location.origin}${location.pathname}`;

/** Short links (`#s=code`) point at a copy on the server; long links (`#share=payload`) carry the markup themselves. */
export const hasShareHash = (hash: string) => hash.startsWith('#s=') || hash.startsWith('#share=');

/**
 * Put an encoded share on the server and give back a short link. Without a connection it falls back to the long link,
 * which works on its own, so sharing never fails just because the server is out of reach.
 */
export async function shortLink(kind: 'piece' | 'playlist', title: string, data: string): Promise<string> {
  try {
    const { code } = await pb.send<{ code: string }>('/api/metronome/share', { method: 'POST', body: { kind, title, data } });
    return `${base()}#s=${code}`;
  } catch {
    return `${base()}#share=${data}`;
  }
}

/** What a share link in the address bar holds, or null when it is invalid, unknown or unreachable. */
export async function openShare(hash: string): Promise<Shared | null> {
  try {
    if (hash.startsWith('#share=')) return await decodeAny(hash.slice(7));
    if (!hash.startsWith('#s=')) return null;
    const code = encodeURIComponent(hash.slice(3));
    const { data } = await pb.send<{ data: string }>(`/api/metronome/share/${code}`, {});
    return await decodeAny(data);
  } catch {
    return null;
  }
}
