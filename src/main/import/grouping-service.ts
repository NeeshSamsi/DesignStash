import { randomUUID } from 'node:crypto'
import {
  type GroupMember,
  type GroupingProposal,
  type ProposedGroup
} from '../../shared/grouping'

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
  stem = stem.trim().replace(/[-_\s]+/g, ' ').toLowerCase()

  return stem
}

export class GroupingService {
  /**
   * Takes an array of GroupMember objects, returns a GroupingProposal.
   */
  static propose(batchId: string, members: GroupMember[]): GroupingProposal {
    const pool = [...members]
    const groups: ProposedGroup[] = []

    // Pass 1 — folder grouping (confidence: 'high')
    const folderGroupsMap = new Map<string, GroupMember[]>()
    for (const member of pool) {
      const folderKey = member.folderTrail.join('/')
      if (folderKey) {
        if (!folderGroupsMap.has(folderKey)) {
          folderGroupsMap.set(folderKey, [])
        }
        folderGroupsMap.get(folderKey)!.push(member)
      }
    }

    for (const groupMembers of folderGroupsMap.values()) {
      if (groupMembers.length >= 2) {
        // Create high confidence group
        groups.push(this.createGroup(groupMembers, 'high', 'folder'))
        // Remove from pool
        for (const m of groupMembers) {
          const idx = pool.findIndex((p) => p.mockupId === m.mockupId)
          if (idx !== -1) pool.splice(idx, 1)
        }
      }
    }

    // Pass 2 — stem grouping (confidence: 'medium')
    const stemGroupsMap = new Map<string, GroupMember[]>()
    for (const member of pool) {
      const stem = extractStem(member.fileName)
      if (stem) {
        if (!stemGroupsMap.has(stem)) {
          stemGroupsMap.set(stem, [])
        }
        stemGroupsMap.get(stem)!.push(member)
      }
    }

    for (const groupMembers of stemGroupsMap.values()) {
      if (groupMembers.length >= 2) {
        // Create medium confidence group
        groups.push(this.createGroup(groupMembers, 'medium', 'stem'))
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

  private static createGroup(
    members: GroupMember[],
    confidence: 'high' | 'medium',
    reason: 'folder' | 'stem'
  ): ProposedGroup {
    const sortedMembers = [...members].sort((a, b) => a.fileName.localeCompare(b.fileName))

    return {
      id: randomUUID(),
      members: sortedMembers.map((m, idx) => ({
        ...m,
        isPrimary: idx === 0
      })),
      confidence,
      reason
    }
  }
}
