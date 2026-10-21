import { describe, expect, it } from 'vitest'
import {
  GENERIC_FOLDERS,
  GENERIC_NAME_STARTS,
  REASON_SIMILAR_NAMES,
  REASON_TOP_STASHED,
  mockupCountLabel,
  pileTitle,
  type PileTitleMember
} from './pile-title'

// Pile titles on the Sort board — design/specs/pile-titles.md.

const member = (fileName: string, folder: string[] = [], isPrimary = false): PileTitleMember => ({
  fileName,
  folderTrail: folder,
  isPrimary
})

describe('pileTitle', () => {
  describe('rule 0 · top mockup already stashed', () => {
    it('uses the stashed top mockup’s title, source "leader", reason "top mockup stashed"', () => {
      const result = pileTitle([member('a.psd', ['Clay'], true), member('b.psd', ['Clay'])], {
        stashedTitle: 'Clay iPhone 15 Pro'
      })
      expect(result).toEqual({
        title: 'Clay iPhone 15 Pro',
        source: 'leader',
        reason: 'top mockup stashed'
      })
      expect(REASON_TOP_STASHED).toBe('top mockup stashed')
    })

    it('beats a shared folder and a shared filename start', () => {
      const members = [member('mug_a.psd', ['Mugs'], true), member('mug_b.psd', ['Mugs'])]
      expect(pileTitle(members, { stashedTitle: 'Blue mug' }).source).toBe('leader')
    })

    it('never says "leader" to people', () => {
      const result = pileTitle([member('a.psd', [], true)], { stashedTitle: 'Blue mug' })
      expect(result.reason).not.toMatch(/leader/i)
    })
  })

  describe('rule 1 · shared folder', () => {
    it('titles by the shared last folderTrail segment, source "folder", no reason', () => {
      const result = pileTitle([
        member('front.psd', ['Work', 'iPhone 15 Clay'], true),
        member('back.psd', ['Archive', 'iPhone 15 Clay'])
      ])
      expect(result).toEqual({ title: 'iPhone 15 Clay', source: 'folder' })
    })

    it('skips generic folders (Desktop, Downloads, Documents, mockups, New Folder, Untitled Folder) case-insensitively', () => {
      expect(GENERIC_FOLDERS).toEqual([
        'desktop',
        'downloads',
        'documents',
        'mockups',
        'new folder',
        'untitled folder'
      ])
      for (const folder of [
        'Desktop',
        'DOWNLOADS',
        'documents',
        'Mockups',
        'New Folder',
        'untitled folder'
      ]) {
        const result = pileTitle([member('x1.psd', [folder], true), member('y2.psd', [folder])])
        expect(result.source).not.toBe('folder')
      }
    })

    it('does not apply when members come from different folders', () => {
      const result = pileTitle([member('a.psd', ['One'], true), member('b.psd', ['Two'])])
      expect(result.source).toBe('primary')
    })

    it('does not apply when a member has no folder', () => {
      const result = pileTitle([member('a.psd', ['One'], true), member('b.psd', [])])
      expect(result.source).toBe('primary')
    })
  })

  describe('rule 2 · shared filename start', () => {
    it('uses the longest common prefix cut back to the last _ - or space, written as-is plus "…" (mug_front, mug_side → "mug_…")', () => {
      expect(pileTitle([member('mug_front.psd', [], true), member('mug_side.psd')])).toMatchObject({
        title: 'mug_…',
        source: 'filename'
      })
      expect(
        pileTitle([member('Tote Bag-front.psd', [], true), member('Tote Bag-frame.psd')]).title
      ).toBe('Tote Bag-…')
      expect(pileTitle([member('mug_front.psd', [], true), member('mug_frame.psd')]).title).toBe(
        'mug_…'
      )
    })

    it('needs at least 3 letters/digits in the shared start', () => {
      expect(pileTitle([member('a_front.psd', [], true), member('a_side.psd')]).source).toBe(
        'primary'
      )
      expect(pileTitle([member('ab-front.psd', [], true), member('ab-side.psd')]).source).toBe(
        'primary'
      )
      expect(pileTitle([member('a1b_front.psd', [], true), member('a1b_side.psd')]).source).toBe(
        'filename'
      )
    })

    it('does not cut a word in half when there is no separator', () => {
      expect(pileTitle([member('poster1.psd', [], true), member('poster2.psd')]).source).toBe(
        'primary'
      )
    })

    it('skips generic starts (IMG, DSC, Untitled, Final, Copy, Artboard, Layer, Scan, Screenshot, mockup)', () => {
      expect(GENERIC_NAME_STARTS).toEqual([
        'img',
        'dsc',
        'untitled',
        'final',
        'copy',
        'artboard',
        'layer',
        'scan',
        'screenshot',
        'mockup'
      ])
      for (const start of [
        'IMG',
        'dsc',
        'Untitled',
        'FINAL',
        'Copy',
        'Artboard',
        'Layer',
        'Scan',
        'Screenshot',
        'mockup'
      ]) {
        const result = pileTitle([member(`${start}_001.psd`, [], true), member(`${start}_002.psd`)])
        expect(result.source).toBe('primary')
      }
    })

    it('skips a generic first word even when more follows it', () => {
      const result = pileTitle([member('Final_logo_a.psd', [], true), member('Final_logo_b.psd')])
      expect(result.source).toBe('primary')
    })

    it('sets reason "similar names"', () => {
      const result = pileTitle([member('mug_front.psd', [], true), member('mug_side.psd')])
      expect(result.reason).toBe('similar names')
      expect(REASON_SIMILAR_NAMES).toBe('similar names')
    })

    it('compares case-insensitively but writes the top mockup’s spelling', () => {
      const result = pileTitle([member('Mug_front.psd', [], true), member('mug_side.psd')])
      expect(result.title).toBe('Mug_…')
    })
  })

  describe('rule 3 · top mockup’s filename', () => {
    it('falls back to the top mockup’s filename with extension, source "primary", no reason', () => {
      const result = pileTitle([member('poster_a3.psd', [], true), member('flyer.psd')])
      expect(result).toEqual({ title: 'poster_a3.psd', source: 'primary' })
    })

    it('follows the top mockup when it changes', () => {
      const a = member('poster_a3.psd')
      const b = member('flyer.psd')
      expect(pileTitle([{ ...a, isPrimary: true }, b]).title).toBe('poster_a3.psd')
      expect(pileTitle([a, { ...b, isPrimary: true }]).title).toBe('flyer.psd')
    })

    it('leaves rule 1 and rule 2 titles alone when the top mockup changes', () => {
      const folder = (primary: number) => [
        member('a.psd', ['Clay'], primary === 0),
        member('b.psd', ['Clay'], primary === 1)
      ]
      expect(pileTitle(folder(0)).title).toBe(pileTitle(folder(1)).title)
      const names = (primary: number) => [
        member('mug_front.psd', [], primary === 0),
        member('mug_side.psd', [], primary === 1)
      ]
      expect(pileTitle(names(0)).title).toBe(pileTitle(names(1)).title)
    })

    it('uses the first member when none is marked as the top', () => {
      expect(pileTitle([member('first.psd'), member('second.psd')]).title).toBe('first.psd')
    })

    it('titles a single-member pile by that member', () => {
      expect(pileTitle([member('solo.psd', ['Clay'], true)])).toEqual({
        title: 'solo.psd',
        source: 'primary'
      })
    })
  })

  describe('count label', () => {
    it('says "1 mockup" / "N mockups"', () => {
      expect(mockupCountLabel(1)).toBe('1 mockup')
      expect(mockupCountLabel(2)).toBe('2 mockups')
      expect(mockupCountLabel(14)).toBe('14 mockups')
    })

    it('never uses the count as the title', () => {
      expect(pileTitle([member('a.psd', [], true), member('b.psd')]).title).not.toMatch(/mockups?$/)
    })
  })

  describe('same zip', () => {
    const zipMember = (
      fileName: string,
      folder: string[],
      archiveTitle?: string,
      isPrimary = false
    ): PileTitleMember => ({
      fileName,
      folderTrail: folder,
      isPrimary,
      ...(archiveTitle ? { archiveTitle } : {})
    })

    it('titles a pile from one zip by the zip’s cleaned name, with the folder icon', () => {
      const result = pileTitle([
        zipMember(
          'Apple Watch Ultra - Realistic, PSD.psd',
          ['Apple Watch Ultra Mockup', 'Realistic'],
          'Apple Watch Ultra Mockup',
          true
        ),
        zipMember(
          'Apple Watch Ultra - Сlay, PSD.psd',
          ['Apple Watch Ultra Mockup', 'Clay Version'],
          'Apple Watch Ultra Mockup'
        )
      ])
      expect(result).toEqual({ title: 'Apple Watch Ultra Mockup', source: 'folder' })
    })

    it('falls through to the other rules when the members come from different zips or none', () => {
      expect(
        pileTitle([zipMember('mug_a.psd', [], 'Mugs', true), zipMember('mug_b.psd', [], 'Cups')])
          .source
      ).toBe('filename')
      expect(
        pileTitle([zipMember('mug_a.psd', [], 'Mugs', true), zipMember('mug_b.psd', [])]).source
      ).toBe('filename')
    })

    it('still loses to a stashed top mockup', () => {
      expect(
        pileTitle([zipMember('a.psd', [], 'Mugs', true), zipMember('b.psd', [], 'Mugs')], {
          stashedTitle: 'Blue mug'
        }).title
      ).toBe('Blue mug')
    })
  })
})
