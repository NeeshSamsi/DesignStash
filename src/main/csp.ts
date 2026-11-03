import type { Session } from 'electron'
// Relative, not '@shared': electron.vite.config.ts imports this file and has no aliases.
import { COVER_SCHEME } from '../shared/cover-url'

export interface CspOptions {
  /** The Vite dev server's address, set only when the renderer is served from it. */
  devUrl?: string | undefined
}

/**
 * The Content-Security-Policy for the renderer. Production is strict: scripts only from the
 * bundle, no network, no frames, no plugins. What the page loads is covered by `stash-cover:`
 * images, bundled fonts, and the inline styles Radix and sonner write at runtime. In development
 * the Vite server needs its own origin, its HMR websocket and the inline React Refresh preamble.
 */
export function buildCsp({ devUrl }: CspOptions = {}): string {
  const dev = devUrl ? new URL(devUrl) : null
  const socket = dev ? `${dev.protocol === 'https:' ? 'wss' : 'ws'}://${dev.host}` : null

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': dev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", `${COVER_SCHEME}:`, 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': dev ? ["'self'", dev.origin, socket!] : ["'self'"],
    'object-src': ["'none'"],
    'frame-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"]
  }
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ')
}

/**
 * The packaged app loads the renderer from file://, where response headers are not reliable, so
 * production carries the strict policy in a meta tag instead. This is the tag descriptor the
 * Vite `transformIndexHtml` hook injects; development uses the header path (applyCsp).
 */
export function cspMetaTags(): {
  tag: 'meta'
  attrs: Record<string, string>
  injectTo: 'head-prepend'
}[] {
  return [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp() },
      injectTo: 'head-prepend'
    }
  ]
}

/** Sets the policy on every response the session receives, replacing any the response already has. */
export function applyCsp(session: Pick<Session, 'webRequest'>, options: CspOptions = {}): void {
  const policy = buildCsp(options)
  session.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders }
    for (const name of Object.keys(headers)) {
      if (name.toLowerCase() === 'content-security-policy') delete headers[name]
    }
    headers['Content-Security-Policy'] = [policy]
    callback({ responseHeaders: headers })
  })
}
