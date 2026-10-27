import { describe, expect, it } from 'vitest'
import { rendererDevUrl } from './renderer-url'

describe('rendererDevUrl', () => {
  it('loads the dev server electron-vite names in development', () => {
    expect(rendererDevUrl({ ELECTRON_RENDERER_URL: 'http://localhost:5173/' }, false)).toBe(
      'http://localhost:5173/'
    )
  })

  it('never loads another page in the installed app, whatever the environment says', () => {
    // The preload bridge goes to whatever page loads, so a packaged app only ever loads its own files.
    expect(rendererDevUrl({ ELECTRON_RENDERER_URL: 'https://example.com/' }, true)).toBeUndefined()
  })

  it('loads the built files when the variable is unset or empty', () => {
    expect(rendererDevUrl({}, false)).toBeUndefined()
    expect(rendererDevUrl({ ELECTRON_RENDERER_URL: '' }, false)).toBeUndefined()
  })
})
