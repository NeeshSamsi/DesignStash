import type { AiStatus, InboxItem } from '@shared/inbox'

/** Pure copy and rules for To sort, To stash and Trash. The pages wire these to IPC. */

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

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

/** The success toast after the approval flow: all stashed, or some skipped. */
export function doneMessage(
  stashed: number,
  skipped: number
): { message: string; description?: string } {
  if (skipped === 0)
    return { message: `All tucked away · ${plural(stashed, 'mockup', 'mockups')} stashed` }
  return {
    message: `${stashed} tucked away`,
    description: `${skipped} skipped ${skipped === 1 ? 'one is' : 'ones are'} waiting in To stash.`
  }
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
  if (age < HOUR) return `${plural(Math.floor(age / MINUTE), 'minute', 'minutes')} ago`
  if (age < DAY) return `${plural(Math.floor(age / HOUR), 'hour', 'hours')} ago`
  if (age < 30 * DAY) return `${plural(Math.floor(age / DAY), 'day', 'days')} ago`
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

export function trashDescription(count: number, bytes: number | null): string {
  const size = bytes === null ? '' : ` · ${formatBytes(bytes)}`
  return `${plural(count, 'item', 'items')}${size}`
}

export const pluralise = plural

export interface TossCopy {
  title: string
  description: string
  confirmLabel: string
  /** The "N mockups · size" row. Left out when the size can't be measured. */
  detailTitle?: string
  detailMeta?: string
}

/** The Toss confirm, worded as in Figma I1.E2 (To sort) and I2.E1 (To stash). */
export function tossCopy(stage: 'to_sort' | 'to_stash', items: readonly InboxItem[]): TossCopy {
  const n = items.length
  const discard = `Discard ${plural(n, 'mockup', 'mockups')}`
  if (stage === 'to_stash') {
    return {
      title: 'Toss these?',
      description:
        n === 1
          ? 'This deletes the sorted mockup and its PSD from your stash folder. Your original stays right where it is.'
          : `This deletes the ${n} sorted mockups and their PSDs from your stash folder. Your originals stay right where they are.`,
      confirmLabel: discard
    }
  }
  const sizes = items.map((item) => item.sizeBytes)
  const measured = sizes.every((size): size is number => size !== null)
  return {
    title: 'Toss this haul?',
    description:
      n === 1
        ? 'This deletes the copied PSD and its cover from your stash folder. Your original stays right where it is.'
        : `This deletes the ${n} copied PSDs and their covers from your stash folder. Your originals stay right where they are.`,
    confirmLabel: discard,
    ...(measured
      ? {
          detailTitle: plural(n, 'mockup', 'mockups'),
          detailMeta: formatBytes(sizes.reduce((sum, size) => sum + size, 0))
        }
      : {})
  }
}
