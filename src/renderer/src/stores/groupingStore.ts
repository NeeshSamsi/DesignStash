import { create } from 'zustand'
import type { GroupingProposal, ProposedGroup, GroupMember } from '@shared/grouping'

interface EditableGroup {
  id: string
  members: GroupMember[]
  confidence: ProposedGroup['confidence']
  reason: ProposedGroup['reason']
}

interface GroupingState {
  batchId: string | null
  groups: EditableGroup[]
  singletons: GroupMember[]
  isLoading: boolean
  isConfirming: boolean

  setProposal(proposal: GroupingProposal): void
  moveMockupToGroup(mockupId: number, targetGroupId: string): void
  moveMockupToSingletons(mockupId: number): void
  disbandGroup(groupId: string): void
  mergeGroups(groupIdA: string, groupIdB: string): void
  createGroupFromSingletons(mockupIds: number[]): void
  setLoading(loading: boolean): void
  setConfirming(confirming: boolean): void
  reset(): void
}

function recalculatePrimaries(group: EditableGroup): EditableGroup {
  const sorted = [...group.members].sort((a, b) => a.fileName.localeCompare(b.fileName))
  return {
    ...group,
    members: sorted.map((m, i) => ({ ...m, isPrimary: i === 0 }))
  }
}

function findAndRemoveMember(
  groups: EditableGroup[],
  singletons: GroupMember[],
  mockupId: number
): { member: GroupMember | null; groups: EditableGroup[]; singletons: GroupMember[] } {
  // Search singletons first
  const singletonIdx = singletons.findIndex((m) => m.mockupId === mockupId)
  if (singletonIdx !== -1) {
    const member = singletons[singletonIdx]!
    return {
      member,
      groups,
      singletons: singletons.filter((_, i) => i !== singletonIdx)
    }
  }

  // Search groups
  let member: GroupMember | null = null
  const updatedGroups = groups
    .map((g) => {
      const idx = g.members.findIndex((m) => m.mockupId === mockupId)
      if (idx === -1) return g
      member = g.members[idx]!
      const remaining = g.members.filter((_, i) => i !== idx)
      return { ...g, members: remaining }
    })
    .filter((g) => g.members.length > 0)
    .map(recalculatePrimaries)

  return { member, groups: updatedGroups, singletons }
}

const newGroupId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export const useGroupingStore = create<GroupingState>((set) => ({
  batchId: null,
  groups: [],
  singletons: [],
  isLoading: false,
  isConfirming: false,

  setProposal(proposal) {
    set({
      batchId: proposal.batchId,
      groups: proposal.groups.map((g) =>
        recalculatePrimaries({
          id: g.id,
          members: g.members,
          confidence: g.confidence,
          reason: g.reason
        })
      ),
      singletons: proposal.singletons.map((m) => ({ ...m, isPrimary: false }))
    })
  },

  moveMockupToGroup(mockupId, targetGroupId) {
    set((state) => {
      const { member, groups, singletons } = findAndRemoveMember(
        state.groups,
        state.singletons,
        mockupId
      )
      if (!member) return state

      const updatedGroups = groups.map((g) => {
        if (g.id !== targetGroupId) return g
        return recalculatePrimaries({ ...g, members: [...g.members, member] })
      })

      return { groups: updatedGroups, singletons }
    })
  },

  moveMockupToSingletons(mockupId) {
    set((state) => {
      const { member, groups, singletons } = findAndRemoveMember(
        state.groups,
        state.singletons,
        mockupId
      )
      if (!member) return state
      return { groups, singletons: [...singletons, { ...member, isPrimary: false }] }
    })
  },

  disbandGroup(groupId) {
    set((state) => {
      const group = state.groups.find((g) => g.id === groupId)
      if (!group) return state
      return {
        groups: state.groups.filter((g) => g.id !== groupId),
        singletons: [...state.singletons, ...group.members.map((m) => ({ ...m, isPrimary: false }))]
      }
    })
  },

  mergeGroups(groupIdA, groupIdB) {
    set((state) => {
      const groupB = state.groups.find((g) => g.id === groupIdB)
      if (!groupB) return state
      const updatedGroups = state.groups
        .filter((g) => g.id !== groupIdB)
        .map((g) => {
          if (g.id !== groupIdA) return g
          return recalculatePrimaries({ ...g, members: [...g.members, ...groupB.members] })
        })
      return { groups: updatedGroups }
    })
  },

  createGroupFromSingletons(mockupIds) {
    set((state) => {
      const picked = state.singletons.filter((m) => mockupIds.includes(m.mockupId))
      if (picked.length < 2) return state
      const remaining = state.singletons.filter((m) => !mockupIds.includes(m.mockupId))
      const newGroup: EditableGroup = recalculatePrimaries({
        id: newGroupId(),
        members: picked,
        confidence: 'medium',
        reason: 'stem'
      })
      return { groups: [...state.groups, newGroup], singletons: remaining }
    })
  },

  setLoading(loading) {
    set({ isLoading: loading })
  },

  setConfirming(confirming) {
    set({ isConfirming: confirming })
  },

  reset() {
    set({ batchId: null, groups: [], singletons: [], isLoading: false, isConfirming: false })
  }
}))
