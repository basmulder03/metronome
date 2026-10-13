import type { ClickOpts, Kit, Pattern, Silence } from './audio';

/** How the click sounds, shared by playback, playlists and exports. Remembered on this device (a per-viewer convenience). */
const KEY = 'metronome.sound';
const PATTERNS: Pattern[] = ['groups', 'all', 'even', 'bar'];
const KITS: Kit[] = ['click', 'wood', 'beep', 'tick'];
const SILENCE: Silence[] = ['off', 'alternate', 'fourth'];

function load(): { pattern: Pattern; kit: Kit; volume: number; speed: number; silent: Silence; flash: boolean; vibrate: boolean } {
  const base = { pattern: 'groups' as Pattern, kit: 'click' as Kit, volume: 0.8, speed: 100, silent: 'off' as Silence, flash: false, vibrate: false };
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      pattern: PATTERNS.includes(x.pattern) ? x.pattern : base.pattern,
      kit: KITS.includes(x.kit) ? x.kit : base.kit,
      volume: typeof x.volume === 'number' && x.volume >= 0 && x.volume <= 1 ? x.volume : base.volume,
      silent: SILENCE.includes(x.silent) ? x.silent : base.silent,
      flash: x.flash === true,
      vibrate: x.vibrate === true,
      speed: typeof x.speed === 'number' && x.speed >= 25 && x.speed <= 200 ? x.speed : base.speed,
    };
  } catch { return base; }
}

export const sound = $state(load());

export function saveSound() {
  try { localStorage.setItem(KEY, JSON.stringify({ pattern: sound.pattern, kit: sound.kit, volume: sound.volume, speed: sound.speed, silent: sound.silent, flash: sound.flash, vibrate: sound.vibrate })); } catch { /* not remembered */ }
}

/** The settings as the player and the exporter take them. */
export const clickOpts = (extra: { gap?: number } = {}): ClickOpts => ({ subdivide: sound.pattern === 'all', pattern: sound.pattern, kit: sound.kit, volume: sound.volume, silent: sound.silent, ...extra });

/** The beat that is sounding right now (-1 between beats), for the flashing dot. */
export const beat = $state({ accent: -1 });
let beatTimer = 0;

/** One beat has just sounded: flash the dot and buzz the phone, when those are switched on. */
export function beatSignal(accent: 0 | 1 | 2) {
  if (sound.vibrate) { try { navigator.vibrate?.(accent === 2 ? 45 : accent === 1 ? 25 : 12); } catch { /* not supported */ } }
  if (!sound.flash) return;
  beat.accent = accent;
  clearTimeout(beatTimer);
  beatTimer = window.setTimeout(() => (beat.accent = -1), 110);
}
