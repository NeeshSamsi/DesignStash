import { describe, it, expect } from 'vitest'
import { GroupingService, extractStem } from './grouping-service'
import { type GroupMember } from '../../shared/grouping'

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
  function makeMember(fileName: string, folderTrail: string[] = [], mockupId = idCounter++): GroupMember {
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
    expect(proposal.groups[0]!.confidence).toBe('high')
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
    const members = [
      makeMember('landing-A.psd', ['Web']),
      makeMember('landing-B.psd', ['Mobile'])
    ]
    const proposal = GroupingService.propose('batch-1', members)

    expect(proposal.groups).toHaveLength(1)
    expect(proposal.groups[0]!.members).toHaveLength(2)
    expect(proposal.groups[0]!.confidence).toBe('medium')
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
})
