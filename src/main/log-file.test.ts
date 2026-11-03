import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogFile } from './log-file'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ds-log-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('createLogFile', () => {
  it('appends lines and reads the tail back oldest first', () => {
    const log = createLogFile({ dir })
    for (const l of ['a', 'b', 'c', 'd']) log.write(l)
    expect(log.tail(3)).toBe('b\nc\nd')
    expect(readFileSync(join(dir, 'designstash.log'), 'utf-8')).toBe('a\nb\nc\nd\n')
  })

  it('scrubs every line before it reaches the disk', () => {
    const log = createLogFile({ dir, scrub: (s) => s.replace('secret', '<path>') })
    log.write('opened secret')
    expect(readFileSync(join(dir, 'designstash.log'), 'utf-8')).toBe('opened <path>\n')
  })

  it('rolls over at the size limit and keeps only the newest files', () => {
    const log = createLogFile({ dir, maxBytes: 10, files: 3 })
    for (let i = 0; i < 12; i++) log.write(`line-${i}`)
    expect(readdirSync(dir).sort()).toEqual(['designstash.1.log', 'designstash.2.log', 'designstash.log'])
    const tail = log.tail(500).split('\n')
    expect(tail.at(-1)).toBe('line-11')
    expect(tail).not.toContain('line-0')
  })

  it('does not throw when the folder cannot be written', () => {
    writeFileSync(join(dir, 'blocked'), 'x')
    const log = createLogFile({ dir: join(dir, 'blocked', 'nested') })
    log.write('x')
    expect(log.tail(5)).toBe('')
  })
})
