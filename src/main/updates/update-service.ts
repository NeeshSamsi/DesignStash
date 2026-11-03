import type { UpdateStatus } from '@shared/ipc/app'
import type { SettingsStore } from '../settings'

export type { UpdateStatus }

/**
 * The seam for app updates (decision D3). The beta builds are unsigned, and macOS will not let an
 * unsigned app replace itself, so `GithubUpdateService` only tells the user a newer release exists
 * and opens its page; `install()` is that "Download".
 *
 * When builds are signed and notarised, an `electron-updater` implementation replaces it behind
 * this same interface: `check()` maps to `autoUpdater.checkForUpdates()`, the `downloading` and
 * `ready` states (already in `UpdateStatus`) carry its progress, `cancel()` cancels the download
 * and `install()` calls `quitAndInstall()`. The About pane and the channels stay as they are.
 */
export interface UpdateService {
  status(): UpdateStatus
  check(): Promise<UpdateStatus>
  /** Stop a download in progress. */
  cancel(): void
  /** Download the update: opens the release page now; restarts into a downloaded update later. */
  install(): void
}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

const REPO = 'NeeshSamsi/DesignStash'
export const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const RELEASES_PAGE = `https://github.com/${REPO}/releases`
const DAY_MS = 24 * 60 * 60 * 1000
const TIMEOUT_MS = 5000
const MAX_NOTES = 8000

/** Negative when `a` is older than `b`. Numbers compare as numbers; a prerelease ranks below its release. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const bare = v.replace(/^v/, '')
    const dash = bare.indexOf('-')
    const core = dash === -1 ? bare : bare.slice(0, dash)
    return {
      nums: core.split('.').map((n) => Number.parseInt(n, 10) || 0),
      pre: dash === -1 ? null : bare.slice(dash + 1)
    }
  }
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
    if (d !== 0) return d
  }
  if (x.pre === y.pre) return 0
  if (x.pre === null) return 1
  if (y.pre === null) return -1
  return x.pre.localeCompare(y.pre, undefined, { numeric: true })
}

export interface GithubUpdateDeps {
  settings: SettingsStore
  /** The running app's version (`app.getVersion()`). */
  currentVersion: string
  fetch: FetchLike
  now?: () => Date
  /** Opens a URL in the user's browser (`shell.openExternal`). */
  openExternal: (url: string) => void
}

/** Looks at the project's latest GitHub release and says whether it is newer than this app. */
export class GithubUpdateService implements UpdateService {
  private failed = false
  private readonly now: () => Date

  constructor(private readonly deps: GithubUpdateDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  status(): UpdateStatus {
    const { updatesCheckedAt: lastCheckedAt, updatesLatest: latest } = this.deps.settings.get()
    if (this.failed) return { state: 'check-failed', lastCheckedAt }
    if (latest && compareVersions(latest.version, this.deps.currentVersion) > 0) {
      return { state: 'available', ...latest, lastCheckedAt }
    }
    return { state: 'up-to-date', lastCheckedAt }
  }

  /** The launch check: skipped when the last successful one is under a day old. */
  async checkIfDue(): Promise<UpdateStatus> {
    const last = this.deps.settings.get().updatesCheckedAt
    if (last && this.now().getTime() - new Date(last).getTime() < DAY_MS) return this.status()
    return this.check()
  }

  async check(): Promise<UpdateStatus> {
    try {
      const latest = await this.fetchLatest()
      this.deps.settings.update({
        updatesCheckedAt: this.now().toISOString(),
        updatesLatest: latest
      })
      this.failed = false
    } catch {
      // Offline, rate limited or an unexpected reply: say so quietly and keep what was known.
      this.failed = true
    }
    return this.status()
  }

  cancel(): void {}

  install(): void {
    const status = this.status()
    if (status.state === 'available') this.deps.openExternal(status.releaseUrl)
  }

  private async fetchLatest() {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await this.deps.fetch(LATEST_RELEASE_URL, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'DesignStash' },
        signal: controller.signal
      })
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
      const body = (await res.json()) as {
        tag_name?: unknown
        body?: unknown
        html_url?: unknown
      }
      const tag = typeof body.tag_name === 'string' ? body.tag_name : ''
      if (!/^v?\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(tag)) throw new Error('Unrecognised tag')
      const url = typeof body.html_url === 'string' ? body.html_url : ''
      return {
        version: tag.replace(/^v/, ''),
        notes: typeof body.body === 'string' ? body.body.slice(0, MAX_NOTES) : '',
        // Only ever open a page on the project's own repo.
        releaseUrl: url.startsWith(`${RELEASES_PAGE}/`) ? url : RELEASES_PAGE
      }
    } finally {
      clearTimeout(timer)
    }
  }
}

/** Always up to date; remembers when it was last asked. */
export class NoopUpdateService implements UpdateService {
  constructor(
    private readonly settings: SettingsStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  status(): UpdateStatus {
    return { state: 'up-to-date', lastCheckedAt: this.settings.get().updatesCheckedAt }
  }

  async check(): Promise<UpdateStatus> {
    this.settings.update({ updatesCheckedAt: this.now().toISOString() })
    return this.status()
  }

  cancel(): void {}

  install(): void {}
}
