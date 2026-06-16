import { defineConfig } from '@playwright/test'

/**
 * Electron E2E. NOTE: requires a prior `pnpm build` so `out/main/index.js` exists.
 * Launches the built app and asserts the window renders.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: 'list'
})
