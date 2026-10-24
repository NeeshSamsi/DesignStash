import { copyFileSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { stubSuggestion } from '../../src/main/ai/stub-suggestions'
import { makePsds } from './app'
import { testSet } from './test-set'

/**
 * Real PSDs from the test set that stand in for the names specs seed with, so My Stash, Detail and
 * Look it over show real covers. Small files across kinds and shapes: the can and pouch are tall,
 * the poster and MacBook wide, and the iMacs still show the kit's "Perfect free iMac Mockup"
 * placeholder screen. Without the test set the specs fall back to generated boxes of the same names.
 * Never `sign-off/`: it stays unread until sign-off.
 */
export const REAL_MOCKUPS = {
  /** 47 MB loose PSD, wide (3:2). */
  laptop: { path: 'psds/Macbook-Mockup-on-Rocks-Boho-Interior.psd' },
  /** 39 MB, wide (3:2), its cover a sidecar preview from the zip. */
  poster: {
    path: 'held-out/glass-bus-shelter-poster-mockup.zip',
    entry: 'MDU089_Bus_Stop_Citylight_Mockup/Bus_Stop_Citylight_Mockup.psd'
  },
  /** 2.3 MB, tall (3:4). */
  can: {
    path: 'held-out/drink-can-mockup-matt.zip',
    entry: '3478_Matt_Can_Mockup/Matt_Can_Mockup.psd'
  },
  /** 3.8 MB, tall (3:4). */
  pouch: {
    path: 'held-out/kraft-paper-stand-up-pouch-mockup-2.zip',
    entry: '5265_Kraft_Paper_Food_Pack_Mockup/Kraft_Paper_Food_Pack_Mockup.psd'
  },
  /** 34 MB, 4:3. */
  leggings: {
    path: 'held-out/female-top-and-leggings-mockup.zip',
    entry: 'MD1063_Top&Leggings_Mockup/Leggings_Mockup.psd'
  },
  /** 34 MB each, 4:3, the placeholder screen: three angles of one iMac. */
  imac: {
    path: 'held-out/minimal-imac-mockup.zip',
    entry: 'MD995_Free_iMac_Mockup/Free_iMac_Mockup_1.psd'
  },
  imac_angled: {
    path: 'held-out/minimal-imac-mockup.zip',
    entry: 'MD995_Free_iMac_Mockup/Free_iMac_Mockup_2.psd'
  },
  imac_side: {
    path: 'held-out/minimal-imac-mockup.zip',
    entry: 'MD995_Free_iMac_Mockup/Free_iMac_Mockup_3.psd'
  }
} as const satisfies Record<string, { path: string; entry?: string }>

export type MockupName = keyof typeof REAL_MOCKUPS

/** Whether these specs get real files: the test set is there. */
export const realMockups = testSet.available

/** A mockup put on the "Desktop" for a spec to drop. */
export interface Placed {
  /** The name the spec asked for. */
  key: MockupName
  /** The file's name without extension, as it shows in To sort. */
  name: string
  /** The title the stub AI suggests for it. */
  title: string
}

const sourceOf = (key: MockupName): { path: string; entry?: string } => REAL_MOCKUPS[key]
const fileNameOf = (key: MockupName) => basename(sourceOf(key).entry ?? sourceOf(key).path)

/**
 * Puts each named mockup in `dir` as a PSD: the real one, copied out of the read-only test set
 * (unzipped when it is in a zip), or a generated box named after the key when the set is missing
 * or `synthetic` is asked for.
 */
export function placeMockups(dir: string, keys: MockupName[], synthetic = !realMockups): Placed[] {
  mkdirSync(dir, { recursive: true })
  if (synthetic) {
    makePsds(dir, keys)
    return keys.map((key) => ({ key, name: key, title: stubSuggestion(`${key}.psd`).title }))
  }
  return keys.map((key) => {
    const source = sourceOf(key)
    const from = testSet.real(source.path)
    if (source.entry) {
      // -j drops the zip's folders, so the PSD lands in `dir` under its own name.
      execFileSync('unzip', ['-o', '-j', '-qq', from, source.entry, '-d', dir])
    } else {
      copyFileSync(from, join(dir, basename(from)))
    }
    const fileName = fileNameOf(key)
    return { key, name: fileName.replace(/\.psd$/i, ''), title: stubSuggestion(fileName).title }
  })
}

/** Every title a seeded card can carry, real or generated: the way specs find a card's title. */
export const CARD_TITLE = new RegExp(
  `^(Stub .+|${(Object.keys(REAL_MOCKUPS) as MockupName[])
    .map((key) => stubSuggestion(fileNameOf(key)).title)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})$`
)
