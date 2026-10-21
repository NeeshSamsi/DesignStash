import { describe, it, expect, vi } from 'vitest'
import { GroupingService, extractStem } from './grouping-service'
import { COULDNT_SUGGEST_PILES, type GroupMember } from '../../shared/grouping'

describe('extractStem', () => {
  it('strips file extension and normalizes', () => {
    expect(extractStem('checkout-flow-v2.psd')).toBe('checkout flow')
    expect(extractStem('MacBook_Landing_A.psd')).toBe('macbook landing')
    expect(extractStem('Hero 2.psd')).toBe('hero')
    expect(extractStem('design (copy).psd')).toBe('design')
    expect(extractStem('MyMockup.psd')).toBe('mymockup')
    expect(extractStem('hero-v10.psd')).toBe('hero')
    expect(extractStem('iphone_mockup_B.psd')).toBe('iphone mockup')
  })

  it('handles variants with different casing', () => {
    expect(extractStem('Screen Shot B.png')).toBe('screen shot')
    expect(extractStem('Screen Shot b.png')).toBe('screen shot')
    expect(extractStem('Landing (Copy).psd')).toBe('landing')
  })
})

describe('GroupingService.propose', () => {
  let idCounter = 1
  function makeMember(
    fileName: string,
    folderTrail: string[] = [],
    mockupId = idCounter++
  ): GroupMember {
    return {
      mockupId,
      fileName,
      folderTrail,
      coverPath: `/covers/${mockupId}.png`,
      isPrimary: false
    }
  }

  it('handles folder grouping (3 PSDs in same folder)', () => {
    const members = [
      makeMember('hero-C.psd', ['Devices', 'iPhone']),
      makeMember('hero-A.psd', ['Devices', 'iPhone']),
      makeMember('hero-B.psd', ['Devices', 'iPhone'])
    ]
    const proposal = GroupingService.propose('batch-1', members)

    expect(proposal.groups).toHaveLength(1)
    expect(proposal.groups[0]!.members).toHaveLength(3)
    expect(proposal.groups[0]!).not.toHaveProperty('confidence')
    expect(proposal.groups[0]!.reason).toBe('folder')
    expect(proposal.singletons).toHaveLength(0)

    // Primary selection is alphabetically first
    expect(proposal.groups[0]!.members[0]!.fileName).toBe('hero-A.psd')
    expect(proposal.groups[0]!.members[0]!.isPrimary).toBe(true)
    expect(proposal.groups[0]!.members[1]!.isPrimary).toBe(false)
    expect(proposal.groups[0]!.members[2]!.isPrimary).toBe(false)
  })

  it('handles two separate folder groups', () => {
    const members = [
      makeMember('dash-1.psd', ['Dashboard']),
      makeMember('dash-2.psd', ['Dashboard']),
      makeMember('dash-3.psd', ['Dashboard']),
      makeMember('mob-1.psd', ['Mobile']),
      makeMember('mob-2.psd', ['Mobile'])
    ]
    const proposal = GroupingService.propose('batch-1', members)

    expect(proposal.groups).toHaveLength(2)
    expect(proposal.singletons).toHaveLength(0)
  })

  it('handles stem grouping (matching stems in different folders)', () => {
    const members = [makeMember('landing-A.psd', ['Web']), makeMember('landing-B.psd', ['Mobile'])]
    const proposal = GroupingService.propose('batch-1', members)

    expect(proposal.groups).toHaveLength(1)
    expect(proposal.groups[0]!.members).toHaveLength(2)
    expect(proposal.groups[0]!).not.toHaveProperty('confidence')
    expect(proposal.groups[0]!.reason).toBe('stem')
    expect(proposal.singletons).toHaveLength(0)
  })

  it('all singletons — no shared folder or stem', () => {
    const members = [
      makeMember('hero.psd', ['A']),
      makeMember('checkout.psd', ['B']),
      makeMember('profile.psd', ['C'])
    ]
    const proposal = GroupingService.propose('batch-1', members)

    expect(proposal.groups).toHaveLength(0)
    expect(proposal.singletons).toHaveLength(3)
  })

  it('single file → singleton', () => {
    const members = [makeMember('hero.psd', ['A'])]
    const proposal = GroupingService.propose('batch-1', members)

    expect(proposal.groups).toHaveLength(0)
    expect(proposal.singletons).toHaveLength(1)
  })

  it('folder takes priority over stem', () => {
    const members = [
      makeMember('mockup-A.psd', ['Dashboard']),
      makeMember('mockup-B.psd', ['Dashboard']),
      makeMember('mockup-C.psd', ['Mobile'])
    ]
    const proposal = GroupingService.propose('batch-1', members)

    expect(proposal.groups).toHaveLength(1)
    expect(proposal.groups[0]!.reason).toBe('folder')
    expect(proposal.groups[0]!.members.map((m) => m.fileName)).toContain('mockup-A.psd')
    expect(proposal.groups[0]!.members.map((m) => m.fileName)).toContain('mockup-B.psd')
    expect(proposal.singletons).toHaveLength(1)
    expect(proposal.singletons[0]!.fileName).toBe('mockup-C.psd')
  })

  it('empty input → empty proposal', () => {
    const proposal = GroupingService.propose('batch-1', [])
    expect(proposal.groups).toHaveLength(0)
    expect(proposal.singletons).toHaveLength(0)
  })

  describe('generic folders (S9.E1)', () => {
    it.each(['Desktop', 'Downloads', 'DOCUMENTS', 'mockups', 'New Folder', 'Untitled Folder'])(
      'does not make a pile from files that only share %s',
      (folder) => {
        const members = [
          makeMember('alpha.psd', ['Users', 'me', folder]),
          makeMember('bravo.psd', ['Users', 'me', folder]),
          makeMember('charlie.psd', ['Users', 'me', folder])
        ]
        const proposal = GroupingService.propose('batch-1', members)
        expect(proposal.groups).toHaveLength(0)
        expect(proposal.singletons).toHaveLength(3)
      }
    )

    it('still groups a real folder inside a generic one', () => {
      const members = [
        makeMember('a.psd', ['Downloads', 'iPhone 15 Clay']),
        makeMember('b.psd', ['Downloads', 'iPhone 15 Clay'])
      ]
      const proposal = GroupingService.propose('batch-1', members)
      expect(proposal.groups).toHaveLength(1)
      expect(proposal.groups[0]!.reason).toBe('folder')
    })

    it('lets files from a generic folder still group by name', () => {
      const members = [
        makeMember('poster-A.psd', ['Desktop']),
        makeMember('poster-B.psd', ['Desktop'])
      ]
      const proposal = GroupingService.propose('batch-1', members)
      expect(proposal.groups).toHaveLength(1)
      expect(proposal.groups[0]!.reason).toBe('stem')
    })
  })

  describe('generic stems (S9.E2)', () => {
    it.each(['IMG_2041.psd', 'DSC_0001.psd', 'Untitled-1.psd', 'Screenshot 3.psd', 'Final_1.psd'])(
      'does not group camera dumps and defaults such as %s',
      (name) => {
        const second = name.replace(/\d/, (d) => String(Number(d) + 1))
        const members = [makeMember(name, ['A']), makeMember(second, ['B'])]
        const proposal = GroupingService.propose('batch-1', members)
        expect(proposal.groups).toHaveLength(0)
        expect(proposal.singletons).toHaveLength(2)
      }
    )
  })

  describe('no confidence', () => {
    it('proposes groups without a confidence field', () => {
      const members = [makeMember('hero-A.psd', ['X']), makeMember('hero-B.psd', ['X'])]
      const [group] = GroupingService.propose('batch-1', members).groups
      expect(Object.keys(group!).sort()).toEqual(['id', 'members', 'reason'])
    })
  })

  describe('suggest · Couldn’t suggest piles (S9.E4)', () => {
    it('returns the proposal when it works', () => {
      const result = GroupingService.suggest('batch-1', [
        makeMember('a-1.psd', ['X']),
        makeMember('a-2.psd', ['X'])
      ])
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.proposal.groups).toHaveLength(1)
    })

    it('returns plain copy instead of throwing when grouping fails', () => {
      const broken = {
        get folderTrail(): string[] {
          throw new Error('ENOENT /Users/x/secret.psd')
        }
      } as unknown as GroupMember
      const result = GroupingService.suggest('batch-1', [broken])
      expect(result).toEqual({ ok: false, message: COULDNT_SUGGEST_PILES })
      expect(COULDNT_SUGGEST_PILES).toBe('Couldn’t suggest piles. You can still sort them by hand.')
      expect(COULDNT_SUGGEST_PILES).not.toMatch(/[/\\]|ENOENT|—/)
    })
  })

  describe('proposeOrFallback (S1.E5)', () => {
    it('is the proposal when suggesting works', () => {
      const proposal = GroupingService.proposeOrFallback('b', [
        makeMember('a-1.psd', ['X']),
        makeMember('a-2.psd', ['X'])
      ])
      expect(proposal.groups).toHaveLength(1)
      expect(proposal.suggestionFailed).toBeUndefined()
    })

    it('puts every mockup on its own and says suggesting failed, so the board still works', () => {
      const members = [makeMember('a-1.psd', ['X']), makeMember('a-2.psd', ['X'])]
      const spy = vi.spyOn(GroupingService, 'propose').mockImplementation(() => {
        throw new Error('timed out')
      })
      try {
        const proposal = GroupingService.proposeOrFallback('b', members)
        expect(proposal).toMatchObject({ batchId: 'b', groups: [], suggestionFailed: true })
        expect(proposal.singletons.map((m) => m.mockupId)).toEqual(members.map((m) => m.mockupId))
        expect(proposal.singletons.every((m) => m.isPrimary === false)).toBe(true)
      } finally {
        spy.mockRestore()
      }
    })
  })

  describe('PSDs from the same zip', () => {
    const fromZip = (
      mockupId: number,
      fileName: string,
      folderTrail: string[],
      archive: string,
      archiveTitle?: string
    ): GroupMember => ({
      mockupId,
      fileName,
      folderTrail,
      coverPath: `/covers/${mockupId}.png`,
      isPrimary: false,
      archive,
      ...(archiveTitle ? { archiveTitle } : {})
    })

    it('piles the real Apple Watch pair, whose folders and names differ', () => {
      // From Apple-Watch-Ultra-Mockup.zip. The "С" in Сlay is Cyrillic, as downloaded.
      const proposal = GroupingService.propose('b', [
        fromZip(
          1,
          'Apple Watch Ultra - Realistic, PSD.psd',
          ['Apple Watch Ultra Mockup', 'Realistic'],
          'Apple-Watch-Ultra-Mockup.zip',
          'Apple Watch Ultra Mockup'
        ),
        fromZip(
          2,
          'Apple Watch Ultra - Сlay, PSD.psd',
          ['Apple Watch Ultra Mockup', 'Clay Version'],
          'Apple-Watch-Ultra-Mockup.zip',
          'Apple Watch Ultra Mockup'
        )
      ])
      expect(proposal.groups).toHaveLength(1)
      expect(proposal.groups[0]!.reason).toBe('archive')
      expect(proposal.groups[0]!.members.map((m) => m.mockupId).sort()).toEqual([1, 2])
      expect(proposal.singletons).toEqual([])
    })

    it('keeps every PSD of a zip in one pile, even across its folders', () => {
      const proposal = GroupingService.propose('b', [
        fromZip(
          1,
          'Phone Front.psd',
          ['Pile Of Variants'],
          'Pile_Of_Variants.zip',
          'Pile Of Variants'
        ),
        fromZip(
          2,
          'Phone Side.psd',
          ['Pile Of Variants'],
          'Pile_Of_Variants.zip',
          'Pile Of Variants'
        ),
        fromZip(
          3,
          'Phone Back.psd',
          ['Pile Of Variants', 'Back'],
          'Pile_Of_Variants.zip',
          'Pile Of Variants'
        ),
        fromZip(
          4,
          'Phone Back Dark.psd',
          ['Pile Of Variants', 'Back'],
          'Pile_Of_Variants.zip',
          'Pile Of Variants'
        )
      ])
      expect(proposal.groups).toHaveLength(1)
      expect(proposal.groups[0]!.members).toHaveLength(4)
    })

    it('piles a zip whose name says nothing, by the zip all the same', () => {
      const proposal = GroupingService.propose('b', [
        fromZip(1, 'front.psd', [], '011.zip'),
        fromZip(2, 'back.psd', [], '011.zip')
      ])
      expect(proposal.groups).toHaveLength(1)
    })

    it('never piles two zips together, or a lone PSD from a zip', () => {
      const proposal = GroupingService.propose('b', [
        fromZip(1, 'Cap.psd', ['Free Cap Mockup'], 'Free_Cap_Mockup.zip', 'Free Cap Mockup'),
        fromZip(
          2,
          'Tote.psd',
          ['Free Tote Bag Mockup'],
          'Free_Tote_Bag_Mockup.zip',
          'Free Tote Bag Mockup'
        ),
        makeLoose(3, 'Cap.psd')
      ])
      expect(proposal.groups.filter((g) => g.reason === 'archive')).toEqual([])
    })

    function makeLoose(mockupId: number, fileName: string): GroupMember {
      return { mockupId, fileName, folderTrail: [], coverPath: '', isPrimary: false }
    }
  })
})
