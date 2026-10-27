import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachLogFile, captureConsole, logger, logTail } from './logger'
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

describe('captureConsole', () => {
  /** A console of its own, so the test never swaps the real one. */
  function fakeConsole() {
    return { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  }

  function fileLines(): string[] {
    const lines: string[] = []
    attachLogFile({ write: (l) => lines.push(l), tail: () => lines.join('\n') })
    return lines
  }

  it('sends console errors and warnings to the log file, and still prints them', () => {
    const lines = fileLines()
    const target = fakeConsole()
    const { error, warn } = target
    const release = captureConsole(target)
    target.error('Copy queue could not resume:', new Error('EACCES'))
    target.warn('slow')
    release()
    expect(lines[0]).toMatch(/^\[ERROR\] .* - Copy queue could not resume: Error: EACCES/)
    expect(lines[1]).toMatch(/^\[WARN\] .* - slow$/)
    expect(error).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('writes a logger line once while the console is captured', () => {
    const lines = fileLines()
    const target = fakeConsole()
    const release = captureConsole(target)
    logger.error('broke')
    release()
    expect(lines).toHaveLength(1)
  })

  it('puts the console back when released', () => {
    const lines = fileLines()
    const target = fakeConsole()
    const { error } = target
    captureConsole(target)()
    expect(target.error).toBe(error)
    target.error('after')
    expect(lines).toEqual([])
  })
})
