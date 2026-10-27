import { describe, expect, it } from 'vitest'
import {
  downloadFailureCopy,
  downloadRate,
  downloadRemaining,
  formatBytes,
  formatWhen,
  stashCheckView,
  stashFailureCopy
} from './settings-copy'

const now = new Date(2026, 9, 20, 12, 0)

describe('formatBytes', () => {
  it('uses GB with a decimal, then MB and KB', () => {
    expect(formatBytes(14_200_000_000)).toBe('14.2 GB')
    expect(formatBytes(412_000_000)).toBe('412 MB')
    expect(formatBytes(3_000)).toBe('3 KB')
    expect(formatBytes(12)).toBe('12 B')
  })
})

describe('formatWhen', () => {
  it('says today, yesterday or the date', () => {
    expect(formatWhen(new Date(2026, 9, 20, 9, 41).toISOString(), now)).toBe('today 9:41')
    expect(formatWhen(new Date(2026, 9, 19, 18, 5).toISOString(), now)).toBe('yesterday 18:05')
    expect(formatWhen(new Date(2026, 9, 12, 7, 3).toISOString(), now)).toBe('12 Oct, 7:03')
    expect(formatWhen(null, now)).toBe('not yet')
  })
})

describe('plain copy', () => {
  it('has a reason for every failure, with no codes or paths', () => {
    for (const reason of [
      'same-folder',
      'inside-stash',
      'not-a-folder',
      'not-empty',
      'not-writable',
      'no-space',
      'verify-failed',
      'busy',
      'no-stash',
      'failed'
    ] as const) {
      const { description } = stashFailureCopy(reason)
      expect(description).not.toMatch(/[/\\]|_|failed:|ENOENT/)
    }
    expect(stashFailureCopy('no-stash').description).toBe(
      'There’s no stash in that folder. Pick it again to move your stash there.'
    )
    expect(stashFailureCopy('busy').description).toBe(
      'Mockups are still copying into your stash. Try again once the copy finishes or you cancel it.'
    )
    for (const reason of ['offline', 'disk-full', 'checksum', 'server', undefined] as const) {
      expect(downloadFailureCopy(reason)).toMatch(/try again|Try again/)
    }
  })

  it('leaves out a speed or time it does not know', () => {
    expect(downloadRate(18_000_000)).toBe('18 MB/s')
    expect(downloadRate(0)).toBe('')
    expect(downloadRemaining(null)).toBe('')
    expect(downloadRemaining(30)).toBe('less than a minute left')
    expect(downloadRemaining(180)).toBe('about 3 min left')
  })
})

describe('stashCheckView', () => {
  const at = new Date(2026, 9, 20, 9, 41).toISOString()
  it('reads In sync for a launch check', () => {
    expect(
      stashCheckView({ lastRun: { at, trigger: 'launch', result: 'in-sync', toReview: 0 } }, now)
    ).toEqual({
      tone: 'success',
      tag: 'In sync',
      line: 'Checked when DesignStash opened, today 9:41',
      review: false
    })
  })
  it('offers Review… when something needs a look', () => {
    const view = stashCheckView(
      { lastRun: { at, trigger: 'manual', result: 'review', toReview: 3 } },
      now
    )
    expect(view).toMatchObject({ tone: 'warning', tag: '3 to review', review: true })
  })
  it('says Couldn’t check, and Not checked yet before the first run', () => {
    expect(
      stashCheckView(
        { lastRun: { at, trigger: 'manual', result: 'could-not-check', toReview: 0 } },
        now
      ).tag
    ).toBe('Couldn’t check')
    expect(stashCheckView({ lastRun: null }, now).line).toBe('Not checked yet')
  })
})
