import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // CI's macOS machines are several times slower than a dev Mac; image work (sharp) can pass
    // the 5 s default there.
    testTimeout: process.env.CI ? 30_000 : 5_000,
    hookTimeout: process.env.CI ? 30_000 : 10_000,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.test.ts'],
    // Every source file is in the report, so one no test ever loads shows at 0% instead of being
    // left out of the total. (Vitest 4's form of coverage.all.)
    coverage: { include: ['src/**/*.{ts,tsx}'] }
  }
})
