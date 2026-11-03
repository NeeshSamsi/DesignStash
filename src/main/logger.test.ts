import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachLogFile, logger, logTail } from './logger'
import type { LogFile } from './log-file'

afterEach(() => {
  attachLogFile(null)
  vi.restoreAllMocks()
})

describe('logger with a file', () => {
  it('writes each level to the attached file, with errors as their stack', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const lines: string[] = []
    const file: LogFile = { write: (l) => lines.push(l), tail: () => lines.join('\n') }
    attachLogFile(file)
    logger.info('hello', { a: 1 })
    logger.error('broke', new Error('boom'))
    expect(lines[0]).toMatch(/^\[INFO\] .* - hello \{"a":1\}$/)
    expect(lines[1]).toMatch(/^\[ERROR\] .* - broke Error: boom/)
    expect(logTail(10)).toContain('hello')
  })

  it('only logs to the console when no file is attached', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    logger.warn('plain')
    expect(logTail(10)).toBe('')
  })
})
