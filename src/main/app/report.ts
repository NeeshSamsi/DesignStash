import { scrubText } from '../telemetry/scrub'

export interface ReportFacts {
  version: string
  electron: string
  platform: string
  arch: string
  osRelease: string
  /** Counts are null when the library did not open, so the report says so instead of showing zeros. */
  stashCount: number | null
  toSort: number | null
  toStash: number | null
  trash: number | null
  stashCheck: string
  aiModel: string
}

/**
 * The text copied by "Report a problem": versions, the platform and counts. No titles, no file
 * names and no paths, and the whole text is scrubbed again on the way out (decision D6).
 */
const count = (n: number | null): string => (n === null ? 'unavailable' : String(n))

export function buildReport(facts: ReportFacts): string {
  return scrubText(
    [
      'DesignStash problem report',
      `Version: ${facts.version}`,
      `Electron: ${facts.electron}`,
      `System: ${facts.platform} ${facts.arch} ${facts.osRelease}`,
      `Mockups in My Stash: ${count(facts.stashCount)}`,
      `To sort: ${count(facts.toSort)}, To stash: ${count(facts.toStash)}, Trash: ${count(facts.trash)}`,
      `Stash check: ${facts.stashCheck}`,
      `AI model: ${facts.aiModel}`
    ].join('\n')
  )
}
