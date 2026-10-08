import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH lets the app be served from a sub-path (e.g. GitHub Pages "/budget/"). Defaults to "/".
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    // --- PWA section (owned by the iPhone & PWA agent) ---
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Budget',
        short_name: 'Budget',
        description: 'A simple budget that lives on your phone.',
        display: 'standalone',
        start_url: base,
        scope: base,
        theme_color: '#f5f6fa',
        background_color: '#f5f6fa',
        icons: [],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
