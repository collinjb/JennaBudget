import { defineConfig, devices } from '@playwright/test';

// E2E runs on WebKit (Safari's engine) with iPhone profiles.
// Local: builds + serves the production bundle. Live smoke test: BASE_URL=https://... npx playwright test
const liveUrl = process.env.BASE_URL;
const port = 4173;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: liveUrl ?? `http://localhost:${port}`,
    trace: 'retain-on-failure',
    timezoneId: 'America/Chicago',
    locale: 'en-US',
  },
  projects: [
    { name: 'iphone-se', use: { ...devices['iPhone SE (3rd gen)'] } },
    { name: 'iphone-15', use: { ...devices['iPhone 15'], viewport: { width: 393, height: 852 } } },
    { name: 'iphone-pro-max', use: { ...devices['iPhone 15 Pro Max'], viewport: { width: 430, height: 932 } } },
  ],
  webServer: liveUrl
    ? undefined
    : {
        command: `npm run build && npx vite preview --port ${port} --strictPort`,
        port,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
