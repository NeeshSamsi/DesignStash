import { TELEMETRY_EVENTS, sizeBucket, type TelemetryProps } from '../../shared/telemetry'

type Track = (event: string, props?: TelemetryProps) => void

/** The haul figures `import_completed` needs. A subset of the copy queue's progress. */
interface HaulFigures {
  haulId: string
  state: 'running' | 'paused' | 'done' | 'cancelled'
  landed: number
  total: number
  skipped: Record<string, number>
}

/**
 * Sends `import_completed` once per haul, when it reaches `done`: how many files landed, how many
 * were left out and how long it took from the first progress we saw. Counts and a duration only.
 */
export function createImportCompletedReporter(
  track: Track,
  now: () => number = Date.now
): (progress: HaulFigures) => void {
  const started = new Map<string, number>()
  const reported = new Set<string>()
  return (progress) => {
    if (reported.has(progress.haulId)) return
    if (!started.has(progress.haulId)) started.set(progress.haulId, now())
    if (progress.state !== 'done') return
    reported.add(progress.haulId)
    const skipped = Object.values(progress.skipped).reduce((a, b) => a + b, 0)
    track(TELEMETRY_EVENTS.IMPORT_COMPLETED, {
      files: progress.landed,
      skipped,
      duration_ms: Math.max(0, now() - (started.get(progress.haulId) ?? now()))
    })
    started.delete(progress.haulId)
  }
}

export interface FirstSuggestionSettings {
  get(): { installedAt: string; firstSuggestionSentAt: string | null }
  update(patch: { firstSuggestionSentAt: string }): unknown
}

/**
 * Sends `first_suggestion` once per install, the first time the AI finishes a suggestion, with the
 * whole seconds since the install first ran. Safe to call on every status event.
 */
export function reportFirstSuggestion(
  settings: FirstSuggestionSettings,
  track: Track,
  now: () => Date = () => new Date()
): void {
  const { installedAt, firstSuggestionSentAt } = settings.get()
  if (firstSuggestionSentAt) return
  const at = now()
  settings.update({ firstSuggestionSentAt: at.toISOString() })
  const since = Date.parse(installedAt)
  track(TELEMETRY_EVENTS.FIRST_SUGGESTION, {
    seconds_since_install: Number.isFinite(since) ? Math.max(0, Math.round((at.getTime() - since) / 1000)) : 0
  })
}

/** How many results a search returned, as a range. */
export function resultsBucket(n: number): string {
  return sizeBucket(n)
}
