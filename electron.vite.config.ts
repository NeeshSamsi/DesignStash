import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cspMetaTags } from './src/main/csp'
import { posthogDefine } from './src/main/telemetry/define'

// Production builds only: the dev server is covered by the header in the main process, which
// allows Vite's HMR origin.
const cspMetaPlugin = {
  name: 'designstash-csp-meta',
  apply: 'build' as const,
  transformIndexHtml: () => cspMetaTags()
}

export default defineConfig(({ mode }) => ({
  main: {
    plugins: [externalizeDepsPlugin()],
    // The PostHog key is baked in at build time, never read at runtime: from the environment (the
    // release workflow's secret) or else a local .env. Without one the build stays Noop.
    define: posthogDefine(mode, process.cwd()),
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    },
    build: {
      rollupOptions: {
        external: ['electron', 'better-sqlite3', 'sharp', 'node:crypto'],
        input: {
          index: resolve('src/main/index.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]'
        }
      }
    }
  },
  preload: {
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: { input: { index: resolve('src/renderer/index.html') } }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), tailwindcss(), cspMetaPlugin]
  }
}))
