import { describe, it, expect, vi } from 'vitest'
import { pileTitle } from '../../shared/pile-title'
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

  it('strips trailing angle words, after a number too, as variant naming', () => {
    expect(extractStem('Phone Front.psd')).toBe('phone')
    expect(extractStem('Phone_Back_2.psd')).toBe('phone')
    expect(extractStem('mug-side.psd')).toBe('mug')
    expect(extractStem('Cap Left Angle.psd')).toBe('cap')
    expect(extractStem('Tote Close Up.psd')).toBe('tote')
    expect(extractStem('front.psd')).toBe('')
  })

  it('keeps product words that only look like angles', () => {
    expect(extractStem('Tank Top.psd')).toBe('tank top')
    expect(extractStem('Backpack.psd')).toBe('backpack')
    expect(extractStem('Bedside Lamp.psd')).toBe('bedside lamp')
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

    describe('a zip of different products', () => {
      /** A zip's PSDs; a null title is a zip whose name says nothing. */
      const zip = (names: string[], trail = ['Gym Set'], title: string | null = 'Gym Set') =>
        names.map((n, i) => fromZip(i + 1, n, trail, 'Gym_Set.zip', title ?? undefined))
      const piles = (proposal: ReturnType<typeof GroupingService.propose>) =>
        proposal.groups.map((g) => ({
          title: pileTitle(
            g.members.map(({ fileName, folderTrail, archiveTitle }) => ({
              fileName,
              folderTrail,
              ...(archiveTitle ? { archiveTitle } : {})
            }))
          ).title,
          files: g.members.map((m) => m.fileName)
        }))

      it("leaves each product on its own, and never folds them back together by the zip's folder", () => {
        // The real female-top-and-leggings-mockup.zip: leggings, a top, and the two as a set.
        const proposal = GroupingService.propose(
          'b',
          zip(
            ['Leggings_Mockup.psd', 'Top_Mockup.psd', 'Top&Leggings_Mockup.psd'],
            ['female top and leggings mockup'],
            'female top and leggings mockup'
          )
        )
        expect(proposal.groups).toEqual([])
        expect(proposal.singletons.map((m) => m.fileName).sort()).toEqual([
          'Leggings_Mockup.psd',
          'Top&Leggings_Mockup.psd',
          'Top_Mockup.psd'
        ])
      })

      it('makes a pile per product: the largest named after the zip, the others after their stem', () => {
        const proposal = GroupingService.propose(
          'b',
          zip([
            'Leggings_1.psd',
            'Leggings_2.psd',
            'Leggings_3.psd',
            'Tank_Top_1.psd',
            'Tank_Top_2.psd',
            'Socks.psd'
          ])
        )
        expect(piles(proposal)).toEqual([
          { title: 'Gym Set', files: ['Leggings_1.psd', 'Leggings_2.psd', 'Leggings_3.psd'] },
          { title: 'Tank Top', files: ['Tank_Top_1.psd', 'Tank_Top_2.psd'] }
        ])
        expect(proposal.groups.every((g) => g.reason === 'archive')).toBe(true)
        expect(proposal.singletons.map((m) => m.fileName)).toEqual(['Socks.psd'])
      })

      it("gives the zip's name to the group whose first file sorts first when two are the same size", () => {
        const proposal = GroupingService.propose(
          'b',
          zip(['Shorts_1.psd', 'Shorts_2.psd', 'Bra_1.psd', 'Bra_2.psd'])
        )
        expect(piles(proposal).map((p) => p.title)).toEqual(['Gym Set', 'Shorts'])
        expect(piles(proposal)[0]!.files).toEqual(['Bra_1.psd', 'Bra_2.psd'])
      })

      it("names the others after their stem when the zip's own name says nothing", () => {
        const proposal = GroupingService.propose(
          'b',
          zip(['Mug_1.psd', 'Mug_2.psd', 'Cap_A.psd', 'Cap_B.psd'], [], null)
        )
        expect(proposal.groups).toHaveLength(2)
        expect(
          proposal.groups.find((g) => g.members[0]!.fileName === 'Mug_1.psd')!.members[0]!
            .archiveTitle
        ).toBe('Mug')
        expect(
          proposal.groups.find((g) => g.members[0]!.fileName === 'Cap_A.psd')!.members[0]!
            .archiveTitle
        ).toBeUndefined()
      })

      it('keeps one pile for variant naming: numbers, letters, angles, copies and versions', () => {
        for (const names of [
          ['Mockup_01.psd', 'Mockup_02.psd'],
          ['Poster A.psd', 'Poster B.psd', 'Poster C.psd'],
          ['Bottle_Front.psd', 'Bottle_Back.psd', 'Bottle_Side_2.psd'],
          ['Card.psd', 'Card (copy).psd', 'Card-v2.psd']
        ]) {
          expect(
            GroupingService.propose('b', zip(names)).groups.map((g) => g.members.length)
          ).toEqual([names.length])
        }
      })

      it('keeps one pile when every name shares a start, as a "similar names" pile title does', () => {
        for (const names of [
          ['Qubus (EU).psd', 'Qubus (US).psd'],
          ['Boards Environment.psd', 'Boards Isolated.psd'],
          ['Free_Notebook_Mockup_EU.psd', 'Free_Notebook_Mockup_US.psd']
        ]) {
          const proposal = GroupingService.propose('b', zip(names))
          expect(piles(proposal)).toEqual([
            { title: 'Gym Set', files: [...names].sort((a, b) => a.localeCompare(b)) }
          ])
        }
      })
    })

    function makeLoose(mockupId: number, fileName: string): GroupMember {
      return { mockupId, fileName, folderTrail: [], coverPath: '', isPrimary: false }
    }
  })
})
