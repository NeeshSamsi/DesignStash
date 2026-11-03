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
  /** Crashes noted by the crash log, as one line. Left out when absent. */
  crashes?: string
}

/** How many log lines go with a report. */
export const REPORT_LOG_LINES = 200

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
      `AI model: ${facts.aiModel}`,
      ...(facts.crashes ? [`Crashes: ${facts.crashes}`] : [])
    ].join('\n')
  )
}

/**
 * What "Report a problem" shows and sends besides the tester's own words: the facts above and the
 * tail of the log. Both are scrubbed, and the dialog shows this exact text.
 */
export function buildReportDetails(facts: ReportFacts, logTail: string): string {
  const log = scrubText(logTail).trim()
  return `${buildReport(facts)}\n\nLog (last ${REPORT_LOG_LINES} lines):\n${log || 'No log lines yet.'}`
}
