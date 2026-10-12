<script lang="ts">
  let { text, label }: { text: string; label: string } = $props();
  let svg = $state('');

  // the QR library is only fetched when an invitation is shown
  $effect(() => {
    const t = text;
    const css = getComputedStyle(document.documentElement);
    void import('qrcode').then(async (q) => {
      const svgText = await q.toString(t, {
        type: 'svg', margin: 2, errorCorrectionLevel: 'M',
        color: { dark: css.getPropertyValue('--qr-dark').trim(), light: css.getPropertyValue('--qr-light').trim() },
      });
      if (t === text) svg = svgText;
    });
  });
</script>

<!-- the markup comes from the QR library, built from our own link text -->
<div class="qr" role="img" aria-label={label}>{@html svg}</div>

<style>
  .qr { width: 220px; height: 220px; background: var(--qr-light); border-radius: var(--radius); padding: var(--space-1); }
  .qr :global(svg) { width: 100%; height: 100%; display: block; }
</style>
