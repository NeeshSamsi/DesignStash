import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { noteProcessGone, recentCrashLine, takeNewCrashes } from './crash'

let dir: string
let stateFile: string
let dumps: string
const dump = (name: string, at: Date) => {
  mkdirSync(join(dumps, 'completed'), { recursive: true })
  const f = join(dumps, 'completed', name)
  writeFileSync(f, 'x')
  utimesSync(f, at, at)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ds-crash-'))
  stateFile = join(dir, 'crash-state.json')
  dumps = join(dir, 'Crashpad')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('takeNewCrashes', () => {
  it('sets a baseline on the first run and reports nothing from before', () => {
    dump('old.dmp', new Date('2026-10-01T00:00:00Z'))
    expect(takeNewCrashes({ dumpsDir: dumps, stateFile, now: new Date('2026-10-10T00:00:00Z') })).toEqual([])
  })

  it('reports a dump made after the last check, as the main process when nothing was noted', () => {
    takeNewCrashes({ dumpsDir: dumps, stateFile, now: new Date('2026-10-10T00:00:00Z') })
    dump('a.dmp', new Date('2026-10-11T00:00:00Z'))
    const crashes = takeNewCrashes({ dumpsDir: dumps, stateFile, now: new Date('2026-10-12T00:00:00Z') })
    expect(crashes).toEqual([{ at: '2026-10-11T00:00:00.000Z', type: 'main' }])
    expect(takeNewCrashes({ dumpsDir: dumps, stateFile, now: new Date('2026-10-13T00:00:00Z') })).toEqual([])
  })

  it('takes the process type from a note made while the app ran', () => {
    takeNewCrashes({ dumpsDir: dumps, stateFile, now: new Date('2026-10-10T00:00:00Z') })
    noteProcessGone(stateFile, 'renderer', new Date('2026-10-11T00:00:00Z'))
    dump('b.dmp', new Date('2026-10-11T00:00:01Z'))
    const [crash] = takeNewCrashes({ dumpsDir: dumps, stateFile, now: new Date('2026-10-12T00:00:00Z') })
    expect(crash?.type).toBe('renderer')
  })
})

describe('recentCrashLine', () => {
  it('says none when there are no crashes', () => {
    expect(recentCrashLine(stateFile)).toBe('none in the last 7 days')
  })

  it('counts the week and names the latest', () => {
    takeNewCrashes({ dumpsDir: dumps, stateFile, now: new Date('2026-10-10T00:00:00Z') })
    dump('c.dmp', new Date('2026-10-11T00:00:00Z'))
    takeNewCrashes({ dumpsDir: dumps, stateFile, now: new Date('2026-10-12T00:00:00Z') })
    expect(recentCrashLine(stateFile, new Date('2026-10-13T00:00:00Z'))).toBe(
      '1 in the last 7 days, latest main on 2026-10-11'
    )
    expect(recentCrashLine(stateFile, new Date('2026-11-13T00:00:00Z'))).toBe('none in the last 7 days')
  })
})
