import type { ClickOpts, Kit, Pattern } from './audio';

/** How the click sounds, shared by playback, playlists and exports. Remembered on this device (a per-viewer convenience). */
const KEY = 'metronome.sound';
const PATTERNS: Pattern[] = ['groups', 'all', 'even', 'bar'];
const KITS: Kit[] = ['click', 'wood', 'beep', 'tick'];

function load(): { pattern: Pattern; kit: Kit; volume: number } {
  const base = { pattern: 'groups' as Pattern, kit: 'click' as Kit, volume: 0.8 };
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      pattern: PATTERNS.includes(x.pattern) ? x.pattern : base.pattern,
      kit: KITS.includes(x.kit) ? x.kit : base.kit,
      volume: typeof x.volume === 'number' && x.volume >= 0 && x.volume <= 1 ? x.volume : base.volume,
    };
  } catch { return base; }
}

export const sound = $state(load());

export function saveSound() {
  try { localStorage.setItem(KEY, JSON.stringify({ pattern: sound.pattern, kit: sound.kit, volume: sound.volume })); } catch { /* not remembered */ }
}

/** The settings as the player and the exporter take them. */
export const clickOpts = (extra: { gap?: number } = {}): ClickOpts => ({ subdivide: sound.pattern === 'all', pattern: sound.pattern, kit: sound.kit, volume: sound.volume, ...extra });
