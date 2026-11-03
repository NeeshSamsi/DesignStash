import { defineConfig } from '@playwright/test'

/**
 * Electron E2E. Needs a prior `pnpm build` so `out/main/index.js` exists; `pnpm test:e2e` rebuilds
 * better-sqlite3 for Electron first. Every test launches its own app with its own userData folder
 * (see e2e/fixtures/app.ts), so tests run one at a time and never share state.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list'
})
