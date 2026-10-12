export type Theme = 'system' | 'light' | 'dark';
const KEY = 'metronome.theme';
const ORDER: Theme[] = ['system', 'light', 'dark'];

export function getTheme(): Theme {
  try { const t = localStorage.getItem(KEY); if (t === 'light' || t === 'dark') return t; } catch { /* storage blocked: follow the OS */ }
  return 'system';
}

/** 'system' removes the override so the OS preference (prefers-color-scheme) applies. */
export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme'); else root.dataset.theme = t;
  try { t === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, t); } catch { /* not remembered */ }
}

export const nextTheme = (t: Theme): Theme => ORDER[(ORDER.indexOf(t) + 1) % ORDER.length];
