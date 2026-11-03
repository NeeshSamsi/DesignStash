import { scrubText } from '../telemetry/scrub'

export interface ReportFacts {
  version: string
  electron: string
  platform: string
  arch: string
  osRelease: string
  stashCount: number
  toSort: number
  toStash: number
  trash: number
  stashCheck: string
  aiModel: string
}

/**
 * The text copied by "Report a problem": versions, the platform and counts. No titles, no file
 * names and no paths, and the whole text is scrubbed again on the way out (decision D6).
 */
export function buildReport(facts: ReportFacts): string {
  return scrubText(
    [
      'DesignStash problem report',
      `Version: ${facts.version}`,
      `Electron: ${facts.electron}`,
      `System: ${facts.platform} ${facts.arch} ${facts.osRelease}`,
      `Mockups in My Stash: ${facts.stashCount}`,
      `To sort: ${facts.toSort}, To stash: ${facts.toStash}, Trash: ${facts.trash}`,
      `Stash check: ${facts.stashCheck}`,
      `AI model: ${facts.aiModel}`
    ].join('\n')
  )
}
