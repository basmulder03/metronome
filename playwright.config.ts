import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:5173', launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } },
  webServer: [
    { command: 'npx vite --port 5173', url: 'http://localhost:5173', reuseExistingServer: true },
    // the service worker only exists in a production build
    { command: 'npx vite build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 120_000 },
  ],
  projects: [
    { name: 'desktop', testIgnore: /offline/, use: { viewport: { width: 1280, height: 800 } } },
    { name: 'phone', testIgnore: /offline/, use: { viewport: { width: 390, height: 780 }, hasTouch: true } },
    { name: 'offline', testMatch: /offline/, use: { baseURL: 'http://localhost:4173', viewport: { width: 1280, height: 800 } } },
  ],
});
