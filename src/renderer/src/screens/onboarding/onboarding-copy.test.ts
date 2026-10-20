import { describe, expect, it } from 'vitest'
import {
  AI_STEP,
  DONE_STEP,
  PRIVACY_STEP,
  STASH_STEP,
  WELCOME,
  folderHint,
  friendlyPath,
  locationTrail
} from './onboarding-copy'

describe('friendlyPath', () => {
  it('shortens the home folder to ~', () => {
    expect(friendlyPath('/Users/ada/Pictures/DesignStash')).toBe('~/Pictures/DesignStash')
    expect(friendlyPath('/Users/ada')).toBe('~')
  })

  it('leaves other places alone', () => {
    expect(friendlyPath('/Volumes/Studio SSD/DesignStash')).toBe('/Volumes/Studio SSD/DesignStash')
  })
})

describe('locationTrail', () => {
  it('names the disk and the folders above, with “you” for the home folder', () => {
    expect(locationTrail('/Users/ada/Pictures/DesignStash')).toBe(
      'Macintosh HD › Users › you › Pictures'
    )
  })

  it('starts at the drive name for an external volume', () => {
    expect(locationTrail('/Volumes/Studio SSD/Work/DesignStash')).toBe('Studio SSD › Work')
  })
})

describe('copy', () => {
  it('uses stash and My Stash, never library, and no em dashes', () => {
    const all: string[] = [
      ...[WELCOME, STASH_STEP, PRIVACY_STEP, DONE_STEP, AI_STEP].flatMap((c) => [c.title, c.body]),
      folderHint('missing'),
      folderHint('not-writable')
    ]
    for (const line of all) {
      expect(line).not.toMatch(/library/i)
      expect(line).not.toContain('—')
    }
  })

  it('says what is wrong with a folder in plain words', () => {
    expect(folderHint('missing')).toMatch(/can’t find/)
    expect(folderHint('not-writable')).toMatch(/can’t stash/)
  })
})
