import { describe, it } from 'vitest'

// Pending spec for pile titles on the Sort board — see design/specs/pile-titles.md.
// Implement `pileTitle(members, opts)` in src/shared/pile-title.ts, then turn these into real tests.

describe('pileTitle', () => {
  describe('rule 0 · leader already stashed', () => {
    it.todo('uses the stashed leader’s title, source "leader", reason "leader stashed"')
  })

  describe('rule 1 · shared folder', () => {
    it.todo('titles by the shared last folderTrail segment, source "folder", no reason')
    it.todo('skips generic folders (Desktop, Downloads, Documents, mockups, New Folder, Untitled Folder) case-insensitively')
    it.todo('does not apply when members come from different folders')
  })

  describe('rule 2 · shared filename start', () => {
    it.todo('uses the longest common prefix cut back to the last _ - or space, written as-is plus "…" (mug_front, mug_side → "mug_…")')
    it.todo('needs at least 3 letters/digits in the shared start')
    it.todo('skips generic starts (IMG, DSC, Untitled, Final, Copy, Artboard, Layer, Scan, Screenshot, mockup)')
    it.todo('sets reason "similar names"')
  })

  describe('rule 3 · primary’s filename', () => {
    it.todo('falls back to the primary’s filename with extension, source "primary", no reason')
    it.todo('follows the primary when it changes')
    it.todo('titles a single-member pile by that member')
  })

  describe('count label', () => {
    it.todo('says "1 mockup" / "N mockups"')
  })
})
