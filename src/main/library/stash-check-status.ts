import type { StashCheckStatus as StashCheckStatusData } from '@shared/stash'
import type { SettingsStore } from '../settings'

/** How many files and records the scan found for the user to review. */
export interface ScanReport {
  orphanFiles: number
  orphanRecords: number
}

/**
 * When the stash was last compared with its records, and what turned up. The launch scan and
 * Check now both go through `run`, so Settings always shows the latest of either.
 */
export class StashCheckStatus {
  constructor(
    private readonly settings: SettingsStore,
    private readonly scan: () => Promise<ScanReport>,
    private readonly now: () => Date = () => new Date()
  ) {}

  get(): StashCheckStatusData {
    return { lastRun: this.settings.get().stashCheck }
  }

  async run(trigger: 'launch' | 'manual'): Promise<StashCheckStatusData> {
    const at = this.now().toISOString()
    try {
      const report = await this.scan()
      const toReview = report.orphanFiles + report.orphanRecords
      this.settings.update({
        stashCheck: { at, trigger, result: toReview === 0 ? 'in-sync' : 'review', toReview }
      })
    } catch {
      // The reason may hold a path, so only the fact that it failed is kept.
      this.settings.update({ stashCheck: { at, trigger, result: 'could-not-check', toReview: 0 } })
    }
    return this.get()
  }
}
