import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** Normalize BASE_PATH to "/" or "/sub/path/" (leading and trailing slash). */
function normalizeBase(value: string | undefined): string {
  const trimmed = (value ?? '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

// BASE_PATH lets the app be served from a sub-path (e.g. GitHub Pages "/budget/"). Defaults to "/".
// The URL must never change after install: the iPhone ties the home-screen app and its data to it.
const base = normalizeBase(process.env.BASE_PATH);

// Shown in Settings › About. package.json is the one place the version lives.
const APP_VERSION = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string })
  .version;

// App background colors. Keep in sync with --bg in src/styles/tokens.css, index.html and scripts/generate-icons.mjs.
const LIGHT_BG = '#f2f2f7';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [
    react(),
    // --- PWA section (owned by the iPhone & PWA agent) ---
    VitePWA({
      // The app shows "A new version is ready · Refresh" (src/pwa/UpdateBanner.tsx), so an update never
      // reloads the page in the middle of typing. UpdateBanner registers the service worker itself.
      registerType: 'prompt',
      injectRegister: false,
      // Icons are already matched by globPatterns below; listing them twice would duplicate precache entries.
      includeManifestIcons: false,
      manifest: {
        id: base,
        name: 'Budget',
        short_name: 'Budget',
        description: 'A simple budget that lives on your phone.',
        lang: 'en-US',
        dir: 'ltr',
        display: 'standalone',
        start_url: base,
        scope: base,
        theme_color: LIGHT_BG,
        background_color: LIGHT_BG,
        categories: ['finance', 'productivity'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the whole app (code, styles, page, icons, manifest) so it works in airplane mode.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff2,json,txt}'],
        // Launch screens are only read by iOS when the app is added to the home screen; no need to
        // make every visitor download all 24 of them.
        globIgnores: ['**/node_modules/**/*', 'splash/**'],
        // Every navigation (any URL inside the scope) gets the precached app shell.
        navigateFallback: 'index.html',
        // Stale-cache safety: drop caches from older service worker versions as soon as a new one activates.
        cleanupOutdatedCaches: true,
        // First install: take control of the open page right away so it's offline-ready without a reload.
        clientsClaim: true,
        // Updates wait for the user to tap "Refresh" (which sends SKIP_WAITING); a cold start also picks
        // them up because the waiting worker activates once no page is using the old one.
        skipWaiting: false,
        sourcemap: false,
      },
    }),
  ],
});
