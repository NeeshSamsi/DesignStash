import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createSettingsStore, type SettingsStore } from '../settings'
import { StashCheckStatus } from './stash-check-status'

let dir: string
let settings: SettingsStore
let now: Date
const report = (files: number, records: number) => ({ orphanFiles: files, orphanRecords: records })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ds-check-'))
  settings = createSettingsStore(dir)
  now = new Date('2026-10-20T02:41:00.000Z')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const status = (scan: () => Promise<ReturnType<typeof report>>) =>
  new StashCheckStatus(settings, scan, () => now)

describe('StashCheckStatus', () => {
  it('has never run on a new install', () => {
    expect(status(async () => report(0, 0)).get()).toEqual({ lastRun: null })
  })

  it('records an in-sync launch check', async () => {
    const s = status(async () => report(0, 0))
    expect(await s.run('launch')).toEqual({
      lastRun: { at: '2026-10-20T02:41:00.000Z', trigger: 'launch', result: 'in-sync', toReview: 0 }
    })
  })

  it('counts files and records that need review', async () => {
    const s = status(async () => report(2, 1))
    expect((await s.run('manual')).lastRun).toMatchObject({ trigger: 'manual', result: 'review', toReview: 3 })
  })

  it('records could-not-check when the scan fails, keeping no paths', async () => {
    const s = status(async () => {
      throw new Error('EACCES /Users/me/Stash')
    })
    const res = await s.run('launch')
    expect(res.lastRun).toMatchObject({ result: 'could-not-check', toReview: 0 })
    expect(JSON.stringify(res)).not.toContain('/Users')
  })

  it('a later run replaces the earlier one and survives a restart', async () => {
    await status(async () => report(1, 0)).run('launch')
    now = new Date('2026-10-20T09:00:00.000Z')
    await status(async () => report(0, 0)).run('manual')
    const reloaded = new StashCheckStatus(createSettingsStore(dir), async () => report(0, 0))
    expect(reloaded.get().lastRun).toMatchObject({ trigger: 'manual', result: 'in-sync', at: '2026-10-20T09:00:00.000Z' })
  })
})
