import { useEffect, useRef, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { LibraryItem } from '@shared/library'
import { Lightbox } from '@renderer/components/Lightbox'

interface Entry {
  key: string
  title: string
  coverPath: string
  coverMissing: boolean
  /** A pile not opened yet: stepping onto it swaps it for its variants. */
  pileId?: number
  fromPile: boolean
}

const fromItem = (item: LibraryItem): Entry => ({
  key: `item-${item.id}`,
  title: item.title,
  coverPath: item.coverPath,
  coverMissing: item.coverMissing,
  fromPile: false,
  ...(item.isGroup ? { pileId: item.id } : {})
})

export interface LibraryLightboxProps {
  /** The grid's mockups in its current order (search, filter and sort already applied). */
  items: readonly LibraryItem[]
  /** The mockup it opened on. */
  startId: number
  /** Where focus goes on close: the card it opened from. */
  returnFocusTo: HTMLElement | null
  onClose: () => void
  onCheckLibrary: () => void
}

/**
 * The fullscreen preview over My Stash. ← → step through the grid in order; a pile steps through
 * its variants before moving on. A pile is opened (its variants fetched) when stepping reaches it.
 */
export function LibraryLightbox({
  items,
  startId,
  returnFocusTo,
  onClose,
  onCheckLibrary
}: LibraryLightboxProps) {
  const [sequence, setSequence] = useState<Entry[]>(() => items.map(fromItem))
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      items.findIndex((i) => i.id === startId)
    )
  )
  // Which end of an opened pile to land on: the first variant going forward, the last going back.
  const arrival = useRef<'forward' | 'back'>('forward')
  const entry = sequence[index]

  useEffect(() => {
    if (!entry?.pileId) return
    let current = true
    const pileId = entry.pileId
    void (async () => {
      const res = await window.api.invoke(IPC_CHANNELS.MOCKUP_DETAIL, { mockupId: pileId })
      if (!current) return
      const variants = res.success ? res.data.variants : []
      const entries: Entry[] =
        variants.length > 0
          ? variants.map((variant) => ({
              key: `variant-${variant.id}`,
              title: variant.title,
              coverPath: variant.coverPath,
              coverMissing: variant.coverMissing,
              fromPile: true
            }))
          : [
              {
                key: `variant-${pileId}`,
                title: entry.title,
                coverPath: entry.coverPath,
                coverMissing: entry.coverMissing,
                fromPile: true
              }
            ]
      setSequence((prev) => {
        const at = prev.findIndex((e) => e.pileId === pileId)
        return at === -1 ? prev : [...prev.slice(0, at), ...entries, ...prev.slice(at + 1)]
      })
      if (arrival.current === 'back') setIndex((i) => i + entries.length - 1)
    })()
    return () => {
      current = false
    }
  }, [entry])

  if (!entry) return null
  const opening = entry.pileId !== undefined
  const state = opening ? 'loading' : entry.coverMissing ? 'missing' : 'loaded'
  const hasPrev = index > 0
  const hasNext = index < sequence.length - 1

  return (
    <Lightbox
      open
      mode={entry.fromPile ? 'group' : 'single'}
      state={state}
      caption={entry.title}
      src={entry.coverPath ? `file://${entry.coverPath}` : ''}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
      onCheckLibrary={onCheckLibrary}
      {...(hasPrev
        ? {
            onPrev: () => {
              arrival.current = 'back'
              setIndex((i) => i - 1)
            }
          }
        : {})}
      {...(hasNext
        ? {
            onNext: () => {
              arrival.current = 'forward'
              setIndex((i) => i + 1)
            }
          }
        : {})}
    />
  )
}
