import { describe, expect, it } from 'vitest'
import type { InboxItem } from '@shared/inbox'
import {
  agoText,
  aiTotals,
  doneMessage,
  formatBytes,
  tossCopy,
  newestFirst,
  sniffingBadge,
  sniffingLine,
  verbFor
} from './inbox-list'

const item = (aiStatus: InboxItem['aiStatus']) => ({ aiStatus }) as InboxItem

describe('sniffing', () => {
  it('badges only pending and sniffing cards', () => {
    expect(sniffingBadge('pending')).toBe('Sniffing…')
    expect(sniffingBadge('sniffing')).toBe('Sniffing…')
    for (const status of ['ready', 'failed', 'off'] as const)
      expect(sniffingBadge(status)).toBeUndefined()
  })

  it('reads the line from the totals', () => {
    expect(sniffingLine({ total: 38, remaining: 7 })).toBe('Still sniffing 7 of 38')
    expect(sniffingLine({ total: 38, remaining: 0 })).toBe('AI suggestions ready for all 38')
    expect(sniffingLine(null)).toBeUndefined()
    expect(sniffingLine({ total: 0, remaining: 0 })).toBeUndefined()
  })

  it('counts from the list until the push speaks, and says nothing when the AI is off', () => {
    const items = [item('ready'), item('sniffing'), item('pending')]
    expect(aiTotals(items, null)).toEqual({ total: 3, remaining: 2 })
    expect(aiTotals(items, { total: 3, remaining: 1 })).toEqual({ total: 3, remaining: 1 })
    expect(aiTotals([item('off'), item('off')], { total: 2, remaining: 1 })).toBeNull()
  })
})

describe('copy', () => {
  it('names the selection', () => {
    expect(verbFor('Toss', 0)).toBe('Toss')
    expect(verbFor('Look over', 3)).toBe('Look over 3')
  })

  it('writes the done toast', () => {
    expect(doneMessage(12, 0)).toEqual({ message: 'All tucked away · 12 mockups stashed' })
    expect(doneMessage(1, 0).message).toBe('All tucked away · 1 mockup stashed')
    expect(doneMessage(10, 2)).toEqual({
      message: '10 tucked away',
      description: '2 skipped ones are waiting in To stash.'
    })
    expect(doneMessage(10, 1).description).toBe('1 skipped one is waiting in To stash.')
  })
})

describe('trash', () => {
  const now = Date.parse('2026-10-20T12:00:00Z')
  it('says how long ago', () => {
    expect(agoText('2026-10-20T11:59:30Z', now)).toBe('just now')
    expect(agoText('2026-10-20T11:00:00Z', now)).toBe('1 hour ago')
    expect(agoText('2026-10-18T12:00:00Z', now)).toBe('2 days ago')
    expect(agoText('nope', now)).toBe('a while ago')
  })

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(184 * 1024 * 1024)).toBe('184 MB')
  })

  it('sorts newest first without mutating', () => {
    const list = [{ trashedAt: '2026-10-01T00:00:00Z' }, { trashedAt: '2026-10-05T00:00:00Z' }]
    expect(newestFirst(list)[0]).toBe(list[1])
    expect(list[0]?.trashedAt).toBe('2026-10-01T00:00:00Z')
  })
})

describe('tossCopy', () => {
  const items = (n: number, sizeBytes: number | null = 1024) =>
    Array.from({ length: n }, () => ({ sizeBytes }) as InboxItem)

  it('words the To stash confirm as Figma I2.E1', () => {
    expect(tossCopy('to_stash', items(26))).toEqual({
      title: 'Toss these?',
      description:
        'This deletes the 26 sorted mockups and their PSDs from your stash folder. Your originals stay right where they are.',
      confirmLabel: 'Discard 26 mockups'
    })
  })

  it('words the To sort confirm as Figma I1.E2, with the size row', () => {
    expect(tossCopy('to_sort', items(38, 1024 * 1024))).toEqual({
      title: 'Toss this haul?',
      description:
        'This deletes the 38 copied PSDs and their covers from your stash folder. Your originals stay right where they are.',
      confirmLabel: 'Discard 38 mockups',
      detailTitle: '38 mockups',
      detailMeta: '38 MB'
    })
  })

  it('leaves the size row out when a size is unknown', () => {
    expect(tossCopy('to_sort', items(2, null)).detailTitle).toBeUndefined()
  })
})
