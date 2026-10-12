import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

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
      workbox: { globPatterns: ['**/*.{js,mjs,css,html,svg,png}'], maximumFileSizeToCacheInBytes: 3_000_000, navigateFallback: 'index.html' },
    }),
  ],
  test: { include: ['src/**/*.test.ts'] },
});
