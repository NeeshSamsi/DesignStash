import { randomUUID } from 'node:crypto'
import {
  COULDNT_SUGGEST_PILES,
  type GroupMember,
  type GroupingProposal,
  type ProposedGroup
} from '../../shared/grouping'
import { isGenericFolder, isGenericNameStart } from '../../shared/pile-title'

/**
 * Strip extension + trailing variant suffixes, then normalize.
 */
export function extractStem(fileName: string): string {
  // 1. Remove file extension (everything after last dot)
  let stem = fileName.replace(/\.[^/.]+$/, '')

  // 2. Strip trailing: [-_\\s]?[vV]?\\d+[a-zA-Z]?$   e.g. "-v2", "_3", "2b", " v1"
  stem = stem.replace(/[-_\s]?[vV]?\d+[a-zA-Z]?$/, '')

  // 3. Strip trailing: [-_\\s][A-Za-z]$               e.g. "-A", "_B", " C" (single letter variant)
  stem = stem.replace(/[-_\s][A-Za-z]$/, '')

  // 4. Strip trailing: \\s*\\(copy\\)$                  (case-insensitive)
  stem = stem.replace(/\s*\(copy\)$/i, '')

  // 5. Normalize: trim whitespace, replace [-_\\s]+ with single space, lowercase
  stem = stem
    .trim()
    .replace(/[-_\s]+/g, ' ')
    .toLowerCase()

  return stem
}

export type SuggestResult =
  | { ok: true; proposal: GroupingProposal }
  | { ok: false; message: string }

// Which folders and stems are too generic to group by: design/specs/pile-titles.md
export class GroupingService {
  /**
   * `propose` that never throws: a failure becomes plain copy for "Couldn't suggest piles", with
   * nothing from the error in it (no paths, no codes).
   */
  static suggest(batchId: string, members: GroupMember[]): SuggestResult {
    try {
      return { ok: true, proposal: this.propose(batchId, members) }
    } catch {
      return { ok: false, message: COULDNT_SUGGEST_PILES }
    }
  }

  /**
   * What the Sort board opens with: the suggested piles, or when suggesting fails every mockup on
   * its own and `suggestionFailed` set, so "Couldn't suggest piles" is a toast, not a dead end.
   */
  static proposeOrFallback(batchId: string, members: GroupMember[]): GroupingProposal {
    const result = this.suggest(batchId, members)
    if (result.ok) return result.proposal
    return {
      batchId,
      groups: [],
      singletons: members.map((m) => ({ ...m, isPrimary: false })),
      suggestionFailed: true
    }
  }

  /**
   * Takes an array of GroupMember objects, returns a GroupingProposal.
   */
  static propose(batchId: string, members: GroupMember[]): GroupingProposal {
    const pool = [...members]
    const groups: ProposedGroup[] = []

    // Pass 1 — folder grouping. A generic last folder (Downloads, Desktop…) never forms a pile.
    const folderGroupsMap = new Map<string, GroupMember[]>()
    for (const member of pool) {
      const folderKey = member.folderTrail.join('/')
      const lastFolder = member.folderTrail[member.folderTrail.length - 1] ?? ''
      if (folderKey && !isGenericFolder(lastFolder)) {
        if (!folderGroupsMap.has(folderKey)) {
          folderGroupsMap.set(folderKey, [])
        }
        folderGroupsMap.get(folderKey)!.push(member)
      }
    }

    for (const groupMembers of folderGroupsMap.values()) {
      if (groupMembers.length >= 2) {
        groups.push(this.createGroup(groupMembers, 'folder'))
        // Remove from pool
        for (const m of groupMembers) {
          const idx = pool.findIndex((p) => p.mockupId === m.mockupId)
          if (idx !== -1) pool.splice(idx, 1)
        }
      }
    }

    // Pass 2 — stem grouping. Camera dumps and app defaults (IMG_2041, Untitled-1) never group.
    const stemGroupsMap = new Map<string, GroupMember[]>()
    for (const member of pool) {
      const stem = extractStem(member.fileName)
      if (stem && !isGenericNameStart(stem)) {
        if (!stemGroupsMap.has(stem)) {
          stemGroupsMap.set(stem, [])
        }
        stemGroupsMap.get(stem)!.push(member)
      }
    }

    for (const groupMembers of stemGroupsMap.values()) {
      if (groupMembers.length >= 2) {
        groups.push(this.createGroup(groupMembers, 'stem'))
        // Remove from pool
        for (const m of groupMembers) {
          const idx = pool.findIndex((p) => p.mockupId === m.mockupId)
          if (idx !== -1) pool.splice(idx, 1)
        }
      }
    }

    return {
      batchId,
      groups,
      singletons: pool.map((m) => ({ ...m, isPrimary: false }))
    }
  }

  private static createGroup(members: GroupMember[], reason: 'folder' | 'stem'): ProposedGroup {
    const sortedMembers = [...members].sort((a, b) => a.fileName.localeCompare(b.fileName))

    return {
      id: randomUUID(),
      members: sortedMembers.map((m, idx) => ({
        ...m,
        isPrimary: idx === 0
      })),
      reason
    }
  }
}
