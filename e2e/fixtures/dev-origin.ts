import { createServer, type Server } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { _electron as electron } from '@playwright/test'
import type { E2EApp } from './app'

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.webp': 'image/webp'
}

/** Serves the built renderer over http, which is the origin `pnpm dev` gives the page. */
function serveRenderer(): Promise<{ server: Server; url: string }> {
  const root = join(process.cwd(), 'out', 'renderer')
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]!))
    const file = join(root, path === '/' ? 'index.html' : path)
    try {
      if (!file.startsWith(root) || !statSync(file).isFile()) throw new Error('not a file')
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      res.end(readFileSync(file))
    } catch {
      res.writeHead(404).end()
    }
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({ server, url: `http://127.0.0.1:${port}/` })
    })
  )
}

export interface DevOriginOptions {
  /** Load the page over http, as `pnpm dev` does. Default true; false loads the built files like a packaged app. */
  http?: boolean
  /** Put characters real folders have in the stash's path: a space, a hash and a percent sign. */
  awkwardPath?: boolean
}

/**
 * Launches the built app the way a real library is used: the page on an http origin (as in
 * development) and, optionally, a stash folder whose path has a space, a # and a %, like
 * "Application Support". Used by the cover specs.
 */
export async function launchLikeReal(
  opts: DevOriginOptions = {}
): Promise<E2EApp & { close: () => Promise<void> }> {
  const { http = true, awkwardPath = true } = opts
  const userData = join(
    mkdtempSync(join(tmpdir(), 'designstash-e2e-')),
    awkwardPath ? 'Application Support #1 100%' : 'userdata'
  )
  const stash = join(userData, 'Library')
  mkdirSync(stash, { recursive: true })
  mkdirSync(join(userData, 'models', 'qwen2.5-vl-3b'), { recursive: true })
  writeFileSync(join(userData, 'models', 'qwen2.5-vl-3b', 'model.gguf'), '')
  writeFileSync(join(userData, 'models', 'qwen2.5-vl-3b', 'mmproj.gguf'), '')
  writeFileSync(
    join(userData, 'settings.json'),
    JSON.stringify({
      libraryRoot: stash,
      onboarded: true,
      activeModelId: 'qwen2.5-vl-3b',
      telemetryEnabled: false,
      telemetryInstallId: 'e2e'
    })
  )

  const served = http ? await serveRenderer() : null
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DESIGNSTASH_E2E_STUB_AI: '1',
      ...(served ? { ELECTRON_RENDERER_URL: served.url } : {})
    }
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1800, 1100))

  return {
    app,
    window,
    userData,
    stash,
    invoke: (channel, args) =>
      window.evaluate(
        ([c, a]) =>
          (window as unknown as { api: { invoke: (c: string, a: unknown) => Promise<never> } }).api.invoke(
            c as string,
            a
          ),
        [channel, args] as const
      ),
    close: async () => {
      await app.close().catch(() => {})
      served?.server.close()
      rmSync(join(userData, '..'), { recursive: true, force: true })
    }
  }
}
