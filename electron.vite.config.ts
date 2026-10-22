import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cspMetaTags } from './src/main/csp'

// Production builds only: the dev server is covered by the header in the main process, which
// allows Vite's HMR origin.
const cspMetaPlugin = {
  name: 'designstash-csp-meta',
  apply: 'build' as const,
  transformIndexHtml: () => cspMetaTags()
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    // The PostHog key is baked in at build time (the release workflow passes the secret), never
    // read from the environment at runtime. Without POSTHOG_KEY the build has no key and stays Noop.
    define: {
      __POSTHOG_KEY__: JSON.stringify(process.env.POSTHOG_KEY ?? ''),
      __POSTHOG_HOST__: JSON.stringify(process.env.POSTHOG_HOST ?? '')
    },
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
})
