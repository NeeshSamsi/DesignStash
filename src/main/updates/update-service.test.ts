import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterEach } from 'vitest'
import { createSettingsStore } from '../settings'
import { NoopUpdateService } from './update-service'

const dirs: string[] = []
const dir = () => {
  const d = mkdtempSync(join(tmpdir(), 'ds-upd-'))
  dirs.push(d)
  return d
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

describe('NoopUpdateService', () => {
  it('reads up to date, never checked, on a new install', () => {
    expect(new NoopUpdateService(createSettingsStore(dir())).status()).toEqual({
      state: 'up-to-date',
      lastCheckedAt: null
    })
  })

  it('stays up to date after a check and remembers when', async () => {
    const d = dir()
    const svc = new NoopUpdateService(createSettingsStore(d), () => new Date('2026-10-20T03:00:00.000Z'))
    expect(await svc.check()).toEqual({ state: 'up-to-date', lastCheckedAt: '2026-10-20T03:00:00.000Z' })
    expect(new NoopUpdateService(createSettingsStore(d)).status().lastCheckedAt).toBe('2026-10-20T03:00:00.000Z')
  })

  it('cancel and install do nothing', () => {
    const svc = new NoopUpdateService(createSettingsStore(dir()))
    expect(() => {
      svc.cancel()
      svc.install()
    }).not.toThrow()
  })
})
