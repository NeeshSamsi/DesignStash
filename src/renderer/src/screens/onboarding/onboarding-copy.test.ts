import { describe, expect, it } from 'vitest'
import {
  AI_STEP,
  DONE_STEP,
  PRIVACY_STEP,
  STASH_STEP,
  WELCOME,
  folderHint,
  friendlyPath,
  locationTrail,
  shortPath
} from './onboarding-copy'

describe('friendlyPath', () => {
  it('shortens the home folder to ~', () => {
    expect(friendlyPath('/Users/ada/Pictures/DesignStash')).toBe('~/Pictures/DesignStash')
    expect(friendlyPath('/Users/ada')).toBe('~')
  })

  it('names an external volume by its drive', () => {
    expect(friendlyPath('/Volumes/Studio SSD/DesignStash')).toBe('Studio SSD/DesignStash')
  })

  it('drops the /private macOS puts in front of /var, /tmp and /etc', () => {
    expect(friendlyPath('/private/var/folders/ab/DesignStash')).toBe('/var/folders/ab/DesignStash')
    expect(friendlyPath('/private/tmp/stash')).toBe('/tmp/stash')
  })

  it('leaves other places alone', () => {
    expect(friendlyPath('/Applications/DesignStash')).toBe('/Applications/DesignStash')
    expect(friendlyPath('/private/other/place')).toBe('/private/other/place')
  })
})

describe('shortPath', () => {
  it('keeps short paths whole', () => {
    expect(shortPath('~/Pictures/DesignStash')).toBe('~/Pictures/DesignStash')
  })

  it('cuts the middle and keeps the last two folders', () => {
    expect(shortPath('~/Pictures/Work/Clients/DesignStash')).toBe('~/…/Clients/DesignStash')
    expect(shortPath('Studio SSD/Work/Deep/Deeper/DesignStash')).toBe(
      'Studio SSD/…/Deeper/DesignStash'
    )
    expect(shortPath('/var/folders/ab/cd/DesignStash')).toBe('/var/…/cd/DesignStash')
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
