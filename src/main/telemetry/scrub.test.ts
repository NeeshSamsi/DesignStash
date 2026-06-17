import { describe, it, expect } from 'vitest'
import { scrubText, scrubError } from './scrub'

describe('scrubText', () => {
  it('redacts /Users/<name>/… absolute paths', () => {
    const out = scrubText('failed reading /Users/neesh/repos/designstash/file.psd now')
    expect(out).not.toContain('/Users/neesh')
    expect(out).not.toContain('designstash')
    expect(out).toContain('<path>')
  })

  it('redacts file:// URLs', () => {
    const out = scrubText('module file:///Users/neesh/app/main.js failed')
    expect(out).not.toContain('file://')
    expect(out).not.toContain('/Users/neesh')
    expect(out).toContain('<path>')
  })

  it('leaves non-path text untouched', () => {
    expect(scrubText('import failed: timeout after 3000ms')).toBe(
      'import failed: timeout after 3000ms'
    )
  })
})

describe('scrubError', () => {
  it('removes absolute paths from message and stack, keeps the error name', () => {
    const err = new Error('ENOENT: /Users/neesh/repos/designstash/x.psd')
    err.stack = 'Error: boom\n    at fn (/Users/neesh/repos/designstash/src/main/x.ts:10:5)'
    const scrubbed = scrubError(err)
    expect(scrubbed.name).toBe('Error')
    expect(scrubbed.message).not.toContain('/Users/neesh')
    expect(scrubbed.message).toContain('<path>')
    expect(scrubbed.stack).toBeDefined()
    expect(scrubbed.stack).not.toContain('/Users/neesh')
    expect(scrubbed.stack).toContain('<path>')
  })

  it('preserves custom error type names', () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message)
        this.name = 'CustomError'
      }
    }
    const scrubbed = scrubError(new CustomError('nope'))
    expect(scrubbed.name).toBe('CustomError')
  })

  it('handles non-Error string values', () => {
    expect(scrubError('plain /Users/neesh/x failure').message).not.toContain('/Users/neesh')
  })

  it('handles non-Error object values', () => {
    const scrubbed = scrubError({ detail: '/Users/neesh/secret' })
    expect(scrubbed.message).not.toContain('/Users/neesh')
  })
})
