import { defineConfig } from '@playwright/test';

// the browser tests use their own backend and dev server ports, so a dev backend on 8090 and dev site on 5173 can stay running
const PB_URL = 'http://127.0.0.1:8094';

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:5175', launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } },
  webServer: [
    // backend with a throw-away data dir; each test registers its own user
    { command: 'rm -rf server/pb_test_data && F="--dir=server/pb_test_data --migrationsDir=server/pb_migrations --hooksDir=server/pb_hooks" && server/bin/pocketbase migrate up $F && server/bin/pocketbase superuser upsert test@example.com test-password-123 $F && server/bin/pocketbase make-admin admin@example.com admin-password-123 $F && server/bin/pocketbase serve --http=127.0.0.1:8094 $F', url: 'http://127.0.0.1:8094/api/health', reuseExistingServer: true },
    { command: 'node scripts/copy-assets.mjs && npx vite --port 5175 --strictPort', url: 'http://localhost:5175', reuseExistingServer: true, env: { PB_URL } },
    // the service worker only exists in a production build
    { command: 'node scripts/copy-assets.mjs && npx vite build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 120_000, env: { PB_URL } },
  ],
  projects: [
    { name: 'desktop', testIgnore: /offline/, use: { viewport: { width: 1280, height: 800 } } },
    { name: 'phone', testIgnore: /offline/, use: { viewport: { width: 390, height: 780 }, hasTouch: true } },
    { name: 'offline', testMatch: /offline/, use: { baseURL: 'http://localhost:4173', viewport: { width: 1280, height: 800 } } },
  ],
});
