import { createServer, type Server } from 'node:http'
import { readFileSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { launchApp, type E2EApp } from './app'

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
  const served = http ? await serveRenderer() : null
  return launchApp({
    userDataName: awkwardPath ? 'Application Support #1 100%' : 'userdata',
    env: served ? { ELECTRON_RENDERER_URL: served.url } : undefined,
    onClose: () => served?.server.close()
  })
}
