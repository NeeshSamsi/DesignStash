import { useEffect, useRef, type ReactNode } from 'react'
import type { InboxItem } from '@shared/inbox'
import { coverUrl } from '@shared/cover-url'
import { CoverImage } from '@renderer/components/CoverImage'
import { useInboxCounts } from '@renderer/hooks/use-inbox-counts'
import { pluralise } from '@renderer/lib/inbox-list'
import { useCopyStore } from '@renderer/stores/copyStore'
import { useWaitingStripStore } from '@renderer/stores/waitingStripStore'
import { Button } from '@renderer/ui/button'
import { useInboxList } from '../inboxes/useInboxList'

const COVERS = 3

export interface WaitingToSortStripProps {
  /** Opens Sort on what is waiting in To sort. */
  onSort: (items: InboxItem[]) => void
}

/**
 * The strip that leads My Stash while To sort has anything: a stack of covers, how many wait, what
 * to do, and Later · Sort now. It follows a running copy as files land. Later puts it off until the
 * next copy lands.
 * Figma: Archive › D1 exploration › D1.C Waiting card in My Stash.
 */
export function WaitingToSortStrip({ onSort }: WaitingToSortStripProps) {
  const counts = useInboxCounts()
  const { items } = useInboxList('to_sort')
  const haul = useCopyStore((s) => s.haul)
  const hiddenAt = useWaitingStripStore((s) => s.hiddenAt)
  const later = useWaitingStripStore((s) => s.later)
  const lower = useWaitingStripStore((s) => s.lower)

  const waiting = counts?.toSort ?? 0
  useEffect(() => lower(waiting), [waiting, lower])
  const shown = waiting > 0 && !(hiddenAt !== null && waiting <= hiddenAt)

  const copying = haul !== null && (haul.state === 'running' || haul.state === 'paused')
  // The copy card owns the "N of M copied" count and the per-file detail; the strip only says what waits.
  const title = `${pluralise(waiting, 'mockup', 'mockups')} waiting to be sorted`
  const hint = copying
    ? 'Still copying. They land in To sort as they arrive, so you can start on what is here.'
    : 'They landed in To sort. Sort them into piles, then look them over to stash them.'

  // The newest arrivals lead; a slot whose mockup has not been listed yet shows as loading.
  const newest = [...(items ?? [])].sort((a, b) => b.id - a.id).slice(0, COVERS)
  const slots = Array.from({ length: Math.min(COVERS, waiting) }, (_, i) => newest[i])

  const strip = (
    <section
      aria-label="Waiting to be sorted"
      data-ds="WaitingToSortStrip"
      className="flex items-center gap-4 rounded-xl border border-border bg-surface-2 px-6 py-3"
    >
      <div aria-hidden className="flex shrink-0 items-center pr-2">
        {slots.map((item, i) => (
          <CoverImage
            key={item?.id ?? `slot-${i}`}
            size="xs"
            state={item === undefined ? 'loading' : item.coverPath ? 'loaded' : 'no-preview'}
            {...(item?.coverPath ? { src: coverUrl(item.coverPath) } : {})}
            className={i > 0 ? 'h-12 w-16 -ml-7 rounded-lg' : 'h-12 w-16 rounded-lg'}
          />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="type-body-sm-medium truncate text-foreground">{title}</p>
        <p className="type-body-sm-regular truncate text-muted-foreground">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => later(waiting)}>
          Later
        </Button>
        <Button size="sm" disabled={items === null} onClick={() => onSort(items ?? [])}>
          Sort now
        </Button>
      </div>
    </section>
  )

  // The last strip stays in the tree while it folds away, so it leaves with its own words.
  const last = useRef<ReactNode>(null)
  if (shown) last.current = strip

  // The strip slides open and shut instead of pushing the page: a row that grows from nothing,
  // with the page gap folded into it so a hidden strip takes no space at all.
  return (
    <div
      data-open={shown}
      aria-hidden={!shown}
      inert={!shown}
      style={{ gridTemplateRows: shown ? '1fr' : '0fr' }}
      className={`grid transition-[grid-template-rows,margin,opacity] duration-(--duration-panel-open) ease-panel-out motion-reduce:transition-none ${
        shown ? 'mb-0 opacity-100' : '-mb-4 opacity-0'
      }`}
    >
      <div className="min-h-0 overflow-hidden">{last.current}</div>
    </div>
  )
}
