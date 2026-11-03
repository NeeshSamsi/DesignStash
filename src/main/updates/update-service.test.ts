import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createSettingsStore } from '../settings'
import {
  GithubUpdateService,
  NoopUpdateService,
  compareVersions,
  plainNotes,
  type FetchLike
} from './update-service'

const dirs: string[] = []
const dir = () => {
  const d = mkdtempSync(join(tmpdir(), 'ds-upd-'))
  dirs.push(d)
  return d
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

const NOW = new Date('2026-10-20T03:00:00.000Z')
const RELEASE_URL = 'https://github.com/NeeshSamsi/DesignStash/releases/tag/v0.2.0'

const release = (over: Record<string, unknown> = {}) => ({
  tag_name: 'v0.2.0',
  body: '### Features\n\n* a thing',
  html_url: RELEASE_URL,
  ...over
})
const reply = (body: unknown, status = 200): FetchLike =>
  vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }))

function make(
  fetch: FetchLike,
  over: { dir?: string; version?: string; now?: () => Date; openExternal?: (url: string) => void } = {}
) {
  const settings = createSettingsStore(over.dir ?? dir())
  const openExternal = over.openExternal ?? vi.fn()
  const svc = new GithubUpdateService({
    settings,
    currentVersion: over.version ?? '0.1.0',
    fetch,
    now: over.now ?? (() => NOW),
    openExternal
  })
  return { svc, settings, openExternal }
}

describe('compareVersions', () => {
  it('orders by number, not by text', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('0.1.0', '0.1.1')).toBeLessThan(0)
  })

  it('ignores a leading v and ranks a prerelease below its release', () => {
    expect(compareVersions('v1.2.0', '1.2.0')).toBe(0)
    expect(compareVersions('1.2.0-beta.1', '1.2.0')).toBeLessThan(0)
    expect(compareVersions('1.2.0-beta.2', '1.2.0-beta.1')).toBeGreaterThan(0)
  })
})

describe('GithubUpdateService', () => {
  it('reads up to date, never checked, on a new install', () => {
    expect(make(reply(release())).svc.status()).toEqual({ state: 'up-to-date', lastCheckedAt: null })
  })

  it('asks the latest-release endpoint of the public repo', async () => {
    const fetch = reply(release())
    await make(fetch).svc.check()
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/NeeshSamsi/DesignStash/releases/latest',
      expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/vnd.github+json' }) })
    )
  })

  it('reports a newer release with its version, notes and page', async () => {
    const { svc } = make(reply(release()))
    expect(await svc.check()).toEqual({
      state: 'available',
      version: '0.2.0',
      notes: 'Features\n\n• a thing',
      releaseUrl: RELEASE_URL,
      lastCheckedAt: NOW.toISOString()
    })
  })

  it('is up to date on the same or an older release, and remembers when it looked', async () => {
    expect(await make(reply(release({ tag_name: 'v0.1.0' }))).svc.check()).toEqual({
      state: 'up-to-date',
      lastCheckedAt: NOW.toISOString()
    })
    expect(await make(reply(release({ tag_name: 'v0.0.9' }))).svc.check()).toMatchObject({
      state: 'up-to-date'
    })
  })

  it('keeps reporting the release after a restart, without asking again within a day', async () => {
    const d = dir()
    await make(reply(release()), { dir: d }).svc.check()
    const fetch = reply(release())
    const again = make(fetch, { dir: d, now: () => new Date(NOW.getTime() + 60 * 60 * 1000) })
    expect(again.svc.status()).toMatchObject({ state: 'available', version: '0.2.0' })
    await again.svc.checkIfDue()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('checks again once a day has passed, and Check now always asks', async () => {
    const d = dir()
    await make(reply(release()), { dir: d }).svc.check()
    const fetch = reply(release({ tag_name: 'v0.3.0' }))
    const later = make(fetch, { dir: d, now: () => new Date(NOW.getTime() + 25 * 60 * 60 * 1000) })
    await later.svc.checkIfDue()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(later.svc.status()).toMatchObject({ version: '0.3.0' })
    await later.svc.check()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('stops reporting a release once the app has caught up to it', async () => {
    const d = dir()
    await make(reply(release()), { dir: d }).svc.check()
    expect(make(reply(release()), { dir: d, version: '0.2.0' }).svc.status().state).toBe('up-to-date')
  })

  it('says it could not check when offline, and keeps what it knew', async () => {
    const d = dir()
    await make(reply(release()), { dir: d }).svc.check()
    const offline = make(
      vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND api.github.com')
      }),
      { dir: d }
    )
    expect(await offline.svc.check()).toEqual({ state: 'check-failed', lastCheckedAt: NOW.toISOString() })
    expect(offline.svc.status().state).toBe('check-failed')
  })

  it('says it could not check on a rate limit or a server error, and never throws', async () => {
    for (const status of [403, 429, 500]) {
      const { svc } = make(reply({ message: 'API rate limit exceeded' }, status))
      await expect(svc.check()).resolves.toMatchObject({ state: 'check-failed' })
    }
  })

  it('says it could not check on a reply it does not recognise', async () => {
    expect(await make(reply({ nothing: true })).svc.check()).toMatchObject({ state: 'check-failed' })
    expect(await make(reply(release({ tag_name: 'nightly' }))).svc.check()).toMatchObject({
      state: 'check-failed'
    })
  })

  it('does not wait on a failed launch check before the next one is due', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('offline')
    })
    const { svc } = make(fetch)
    await svc.checkIfDue()
    await svc.checkIfDue()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('recovers on the next successful check', async () => {
    const d = dir()
    const failing = make(reply({}, 500), { dir: d })
    await failing.svc.check()
    const ok = make(reply(release({ tag_name: 'v0.1.0' })), { dir: d })
    expect(await ok.svc.check()).toMatchObject({ state: 'up-to-date' })
  })

  it('install opens the release page in the browser', async () => {
    const { svc, openExternal } = make(reply(release()))
    await svc.check()
    svc.install()
    expect(openExternal).toHaveBeenCalledWith(RELEASE_URL)
  })

  it('opens the releases list when the reported page is not on the project repo', async () => {
    const { svc, openExternal } = make(reply(release({ html_url: 'https://evil.example/x' })))
    expect((await svc.check()) as { releaseUrl: string }).toMatchObject({
      releaseUrl: 'https://github.com/NeeshSamsi/DesignStash/releases'
    })
    svc.install()
    expect(openExternal).toHaveBeenCalledWith('https://github.com/NeeshSamsi/DesignStash/releases')
  })

  it('install does nothing when there is no newer release, and cancel does nothing', () => {
    const { svc, openExternal } = make(reply(release()))
    svc.install()
    svc.cancel()
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('treats a missing body as empty notes', async () => {
    expect(await make(reply(release({ body: null }))).svc.check()).toMatchObject({ notes: '' })
  })
})

describe('release notes (What’s new)', () => {
  it('read as plain text: headings without marks, bullets as dots, links as their words, no commit links', () => {
    const body = [
      '## [0.2.0](https://github.com/NeeshSamsi/DesignStash/compare/v0.1.0...v0.2.0) (2026-10-20)',
      '',
      '',
      '### Features',
      '',
      '* **look-over:** offer the edit to every variant ([abc1234](https://github.com/x/commit/abc1234))',
      '* a plain thing ([#12](https://github.com/x/issues/12)) ([def5678](https://github.com/x/commit/def5678))',
      '',
      '',
      '### Bug Fixes',
      '',
      '* **tags:** keep `iPhone` as typed, see [the spec](https://example.com/spec)'
    ].join('\n')

    expect(plainNotes(body)).toBe(
      [
        '0.2.0 (2026-10-20)',
        '',
        'Features',
        '',
        '• look-over: offer the edit to every variant',
        '• a plain thing',
        '',
        'Bug fixes',
        '',
        '• tags: keep iPhone as typed, see the spec'
      ].join('\n')
    )
  })

  it('leaves plain text as it is', () => {
    expect(plainNotes('Faster covers.\n\n• Fewer clicks')).toBe('Faster covers.\n\n• Fewer clicks')
  })

  it('makes notes an earlier check saved as markdown plain too', async () => {
    const settings = createSettingsStore(dir())
    settings.update({
      updatesCheckedAt: NOW.toISOString(),
      updatesLatest: { version: '0.2.0', notes: '### Features\n\n* a thing', releaseUrl: RELEASE_URL }
    })
    const svc = new GithubUpdateService({
      settings,
      currentVersion: '0.1.0',
      fetch: reply(release()),
      now: () => NOW,
      openExternal: vi.fn()
    })
    expect(svc.status()).toMatchObject({ state: 'available', notes: 'Features\n\n• a thing' })
  })
})

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
