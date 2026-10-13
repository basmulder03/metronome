// The tab's icon beats with the click: a dot that swells on each beat (more on the first of the bar) and settles again.
const SIZE = 64;
const HOLD_MS = 110;

let original: string | undefined;
let timer = 0;
const frames = new Map<number, string>();

/** The theme's accent as the browser resolves it (the token itself is a light-dark() pair). */
function accent(): string {
  const probe = Object.assign(document.createElement('span'), { hidden: true });
  probe.style.color = 'var(--accent)';
  document.body.append(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c;
}

function frame(radius: number): string {
  let url = frames.get(radius);
  if (!url) {
    const c = Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
    const g = c.getContext('2d')!;
    g.fillStyle = accent();
    g.beginPath();
    g.arc(SIZE / 2, SIZE / 2, radius, 0, Math.PI * 2);
    g.fill();
    url = c.toDataURL('image/png');
    frames.set(radius, url);
  }
  return url;
}

const link = () => document.querySelector<HTMLLinkElement>('link[rel="icon"]');
const show = (href: string) => {
  const l = link();
  if (!l) return;
  original ??= l.href;
  l.type = 'image/png';
  l.href = href;
};

/** One beat: swell, then settle after a moment. `accent`: 0 off-beat, 1 beat, 2 start of the bar. */
export function pulseIcon(accent: 0 | 1 | 2) {
  show(frame([14, 20, 29][accent]));
  clearTimeout(timer);
  timer = window.setTimeout(() => show(frame(11)), HOLD_MS);
}

/** Back to the app's own icon. */
export function resetIcon() {
  clearTimeout(timer);
  const l = link();
  if (l && original) { l.type = 'image/svg+xml'; l.href = original; }
  original = undefined;
  frames.clear(); // the next run may be in another theme
}
