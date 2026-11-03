import { describe, expect, it, vi } from 'vitest'
import { applyCsp, buildCsp, cspMetaTags } from './csp'

const directive = (policy: string, name: string): string[] =>
  policy
    .split('; ')
    .find((d) => d.startsWith(`${name} `))
    ?.split(' ')
    .slice(1) ?? []

describe('buildCsp (production)', () => {
  const policy = buildCsp()

  it('takes scripts only from the bundle and allows no network', () => {
    expect(directive(policy, 'script-src')).toEqual(["'self'"])
    expect(directive(policy, 'connect-src')).toEqual(["'self'"])
    expect(policy).not.toMatch(/unsafe-eval|ws:/)
  })

  it('lets covers, data and blob images, bundled fonts and runtime styles load', () => {
    expect(directive(policy, 'img-src')).toEqual(["'self'", 'stash-cover:', 'data:', 'blob:'])
    expect(directive(policy, 'font-src')).toEqual(["'self'", 'data:'])
    expect(directive(policy, 'style-src')).toContain("'unsafe-inline'")
  })

  it('closes plugins, frames, base and forms', () => {
    for (const name of ['object-src', 'frame-src', 'base-uri', 'form-action']) {
      expect(directive(policy, name)).toEqual(["'none'"])
    }
  })
})

describe('buildCsp (development)', () => {
  const policy = buildCsp({ devUrl: 'http://localhost:5173/' })

  it('allows the Vite server, its websocket and the React Refresh preamble', () => {
    expect(directive(policy, 'connect-src')).toEqual([
      "'self'",
      'http://localhost:5173',
      'ws://localhost:5173'
    ])
    expect(directive(policy, 'script-src')).toEqual(["'self'", "'unsafe-inline'"])
  })

  it('still serves covers', () => {
    expect(directive(policy, 'img-src')).toContain('stash-cover:')
  })
})

describe('applyCsp', () => {
  it('sets the policy and replaces one the response had, whatever the header case', () => {
    let listener: ((details: unknown, callback: (r: unknown) => void) => void) | null = null
    const session = {
      webRequest: {
        onHeadersReceived: vi.fn((fn: typeof listener) => {
          listener = fn
        })
      }
    }
    applyCsp(session as never)

    const callback = vi.fn()
    listener!(
      {
        responseHeaders: { 'content-security-policy': ['default-src *'], 'X-Other': ['1'] }
      } as never,
      callback
    )

    const { responseHeaders } = callback.mock.calls[0]![0]
    expect(responseHeaders['Content-Security-Policy']).toEqual([buildCsp()])
    expect(responseHeaders['content-security-policy']).toBeUndefined()
    expect(responseHeaders['X-Other']).toEqual(['1'])
  })
})

describe('cspMetaTags (production index.html)', () => {
  it('injects the strict policy as the first thing in the head', () => {
    const [tag, ...rest] = cspMetaTags()
    expect(rest).toEqual([])
    expect(tag).toEqual({
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp() },
      injectTo: 'head-prepend'
    })
    expect(tag!.attrs.content).not.toContain('localhost')
    expect(tag!.attrs.content).toContain("script-src 'self';")
  })
})
