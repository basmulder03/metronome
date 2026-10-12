<script lang="ts">
  import Button from '../../shared/ui/Button.svelte';
  import { ease } from './timeline';
  import type { Curve } from '../../shared/types';

  let { curve = $bindable(), onchange }: { curve: Curve; onchange: () => void } = $props();

  const PRESETS: Record<string, Curve> = {
    linear: [0, 0, 1, 1],
    'ease in': [0.42, 0, 1, 1],
    'ease out': [0, 0, 0.58, 1],
    'ease in-out': [0.42, 0, 0.58, 1],
    'late (rit. at the end)': [0.7, 0, 1, 0.6],
  };
  const S = 180, PAD = 10;
  const px = (v: number) => PAD + v * S;
  const py = (v: number) => PAD + (1 - v) * S;
  const path = $derived(
    Array.from({ length: 41 }, (_, i) => `${i ? 'L' : 'M'}${px(i / 40)},${py(ease(curve, i / 40))}`).join(''),
  );

  let drag = -1;
  function move(e: PointerEvent) {
    if (drag < 0) return;
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const x = Math.min(1, Math.max(0, ((e.clientX - r.left) / r.width) * (S + 2 * PAD) - PAD) / S);
    const y = Math.min(1.5, Math.max(-0.5, 1 - (((e.clientY - r.top) / r.height) * (S + 2 * PAD) - PAD) / S));
    curve = drag === 0 ? [x, y, curve[2], curve[3]] : [curve[0], curve[1], x, y];
    onchange();
  }
</script>

<div class="wrap">
  <svg role="application" aria-label="Tempo curve editor" viewBox="0 0 {S + 2 * PAD} {S + 2 * PAD}" onpointermove={move} onpointerup={() => (drag = -1)} onpointerleave={() => (drag = -1)}>
    <rect x={PAD} y={PAD} width={S} height={S} fill="none" stroke="var(--border)" />
    <line x1={px(0)} y1={py(0)} x2={px(curve[0])} y2={py(curve[1])} stroke="var(--fg-muted)" />
    <line x1={px(1)} y1={py(1)} x2={px(curve[2])} y2={py(curve[3])} stroke="var(--fg-muted)" />
    <path d={path} fill="none" stroke="var(--accent)" stroke-width="3" />
    {#each [0, 1] as h}
      <circle role="slider" aria-label="Curve handle" aria-valuenow={0} tabindex="-1" cx={px(curve[h * 2])} cy={py(curve[h * 2 + 1])} r="9" fill="var(--accent)" class="handle"
        onpointerdown={(e) => { drag = h; (e.currentTarget as Element).setPointerCapture(e.pointerId); }} />
    {/each}
  </svg>
  <p class="axes">x: position in the range, y: how far from start to end tempo</p>
  <div class="presets">
    {#each Object.entries(PRESETS) as [name, c]}
      <Button size="sm" onclick={() => { curve = [...c]; onchange(); }}>{name}</Button>
    {/each}
  </div>
</div>

<style>
  .handle { touch-action: none; cursor: grab; }
  svg { width: 100%; max-width: 260px; touch-action: none; }
  .axes { color: var(--fg-muted); font-size: 12px; margin: 2px 0 8px; }
  .presets { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
