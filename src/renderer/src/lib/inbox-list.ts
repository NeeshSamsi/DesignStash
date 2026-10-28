import type { AiStatus, InboxItem } from '@shared/inbox'

/** Pure copy and rules for To sort, To stash and Trash. The pages wire these to IPC. */

import { pluralise } from './plural'

/** Cards still waiting on an AI suggestion get the quiet badge. Ready, failed and off get none. */
export function sniffingBadge(status: AiStatus): string | undefined {
  return status === 'pending' || status === 'sniffing' ? 'Sniffing…' : undefined
}

export interface AiTotals {
  total: number
  remaining: number
}

/** Totals from the ai:status push when it has spoken; otherwise counted from the list. */
export function aiTotals(items: readonly InboxItem[], pushed: AiTotals | null): AiTotals | null {
  if (items.every((item) => item.aiStatus === 'off')) return null
  if (pushed) return pushed
  return {
    total: items.length,
    remaining: items.filter((item) => sniffingBadge(item.aiStatus) !== undefined).length
  }
}

/** The action bar's line on To sort. Nothing when the AI is off or the page is empty. */
export function sniffingLine(totals: AiTotals | null): string | undefined {
  if (!totals || totals.total === 0) return undefined
  return totals.remaining > 0
    ? `Still sniffing ${totals.remaining} of ${totals.total}`
    : `AI suggestions ready for all ${totals.total}`
}

/** "Sort", or "Sort 3" when 3 cards are selected. */
export function verbFor(verb: string, selected: number): string {
  return selected > 0 ? `${verb} ${selected}` : verb
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "2 days ago". The card prefixes "Trashed". */
export function agoText(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return 'a while ago'
  const age = Math.max(0, now - then)
  if (age < MINUTE) return 'just now'
  if (age < HOUR) return `${pluralise(Math.floor(age / MINUTE), 'minute')} ago`
  if (age < DAY) return `${pluralise(Math.floor(age / HOUR), 'hour')} ago`
  if (age < 30 * DAY) return `${pluralise(Math.floor(age / DAY), 'day')} ago`
  return new Date(then).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 100 || Number.isInteger(value) ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

/** Newest trashed first. */
export function newestFirst<T extends { trashedAt: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => Date.parse(b.trashedAt) - Date.parse(a.trashedAt))
}
