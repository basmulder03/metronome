import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// the backend (PocketBase) listens on 8090 by default; the app talks to it through same-origin /api.
// PB_URL lets the browser tests point at their own throw-away backend.
const proxy = { '/api': process.env.PB_URL ?? 'http://127.0.0.1:8090' };

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Metronome',
        short_name: 'Metronome',
        description: 'Turn a PDF score into a click track with tempo changes, repeats and WAV export.',
        theme_color: '#3b5bdb',
        background_color: '#16161a',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // everything the app needs, including the pdf.js worker, is precached so it works offline
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,wasm,icc}'],
        // big optional files are not precached: the OCR engine (12 MB), and pdf.js's fonts and character maps (2.5 MB); they are cached when first used.
        // The image decoders and colour profiles in pdfjs/wasm and pdfjs/iccs are small and ARE precached, so scanned scores open offline.
        globIgnores: ['ocr/**', 'pdfjs/standard_fonts/**', 'pdfjs/cmaps/**'],
        maximumFileSizeToCacheInBytes: 3_000_000,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/_\//],
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.startsWith('/ocr/'), handler: 'CacheFirst', options: { cacheName: 'ocr', expiration: { maxEntries: 8 } } },
          { urlPattern: ({ url }) => /^\/pdfjs\/(standard_fonts|cmaps)\//.test(url.pathname), handler: 'CacheFirst', options: { cacheName: 'pdfjs-fonts', expiration: { maxEntries: 200 } } },
        ],
      },
    }),
  ],
  server: { proxy },
  preview: { proxy },
  test: { include: ['src/**/*.test.ts'] },
});
