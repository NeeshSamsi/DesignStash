import type { SettingsStore } from '../settings'

export type UpdateStatus =
  | { state: 'up-to-date'; lastCheckedAt: string | null }
  | { state: 'available'; version: string; lastCheckedAt: string | null }
  | { state: 'downloading'; version: string; progress: number; lastCheckedAt: string | null }
  | { state: 'ready'; version: string; lastCheckedAt: string | null }

/**
 * The seam for app updates (decision D3). Releases have no update channel yet, so the only
 * implementation says "up to date". A real one (electron-updater) can replace it without
 * changing the About pane or its channels.
 */
export interface UpdateService {
  status(): UpdateStatus
  check(): Promise<UpdateStatus>
  /** Stop a download in progress. */
  cancel(): void
  /** Restart into a downloaded update. */
  install(): void
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
