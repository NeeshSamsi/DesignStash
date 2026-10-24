import { randomUUID } from 'node:crypto'
import {
  COULDNT_SUGGEST_PILES,
  type GroupMember,
  type GroupingProposal,
  type ProposedGroup
} from '../../shared/grouping'
import { isGenericFolder, isGenericNameStart, sharedNameStart } from '../../shared/pile-title'

/** Angle words that name a view of the same product: "Bottle_Front", "Cap Left Angle". */
const ANGLE_WORD =
  /(^|[-_\s])(front|back|rear|side|left|right|angle|angled|perspective|overhead|isometric|close[-_\s]?up)$/i

/**
 * A file name without its extension and trailing variant suffixes, words spaced, as written:
 * "Tank_Top_Mockup_2.psd" reads "Tank Top Mockup". Empty when the name is only a variant ("front.psd").
 */
function variantFreeName(fileName: string): string {
  // 1. Remove file extension (everything after last dot)
  let stem = fileName.replace(/\.[^/.]+$/, '')

  // 2 to 5, until nothing changes, so "Phone_Back_2" loses the 2 and then Back.
  for (let before = ''; before !== stem; ) {
    before = stem
    // 2. Strip trailing: [-_\\s]?[vV]?\\d+[a-zA-Z]?$   e.g. "-v2", "_3", "2b", " v1"
    stem = stem.replace(/[-_\s]?[vV]?\d+[a-zA-Z]?$/, '')
    // 3. Strip trailing: [-_\\s][A-Za-z]$               e.g. "-A", "_B", " C" (single letter variant)
    stem = stem.replace(/[-_\s][A-Za-z]$/, '')
    // 4. Strip trailing: \\s*\\(copy\\)$                  (case-insensitive)
    stem = stem.replace(/\s*\(copy\)$/i, '')
    // 5. Strip a trailing angle word                    e.g. "_Front", " Side", "-close-up"
    stem = stem.replace(ANGLE_WORD, '')
  }

  // 6. Normalize: trim whitespace, replace [-_\\s]+ with single space
  return stem.trim().replace(/[-_\s]+/g, ' ')
}

/** Strip extension + trailing variant suffixes, then normalize and lowercase. */
export function extractStem(fileName: string): string {
  return variantFreeName(fileName).toLowerCase()
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
    const take = (groupMembers: GroupMember[]) => {
      for (const m of groupMembers) {
        const idx = pool.findIndex((p) => p.mockupId === m.mockupId)
        if (idx !== -1) pool.splice(idx, 1)
      }
    }

    // Pass 0 — the same dropped zip. Its PSDs belong together whatever folders they have, unless
    // they are different products (`splitZip`). A product on its own stands alone, and never
    // regroups by the zip's folder in the passes below.
    const zipSingles: GroupMember[] = []
    const archiveGroupsMap = new Map<string, GroupMember[]>()
    for (const member of pool) {
      if (!member.archive) continue
      if (!archiveGroupsMap.has(member.archive)) archiveGroupsMap.set(member.archive, [])
      archiveGroupsMap.get(member.archive)!.push(member)
    }
    for (const zipMembers of archiveGroupsMap.values()) {
      if (zipMembers.length < 2) continue
      for (const part of splitZip(zipMembers)) {
        if (part.length >= 2) groups.push(this.createGroup(part, 'archive'))
        else zipSingles.push(...part)
      }
      take(zipMembers)
    }

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
      singletons: [...zipSingles, ...pool].map((m) => ({ ...m, isPrimary: false }))
    }
  }

  private static createGroup(
    members: GroupMember[],
    reason: ProposedGroup['reason']
  ): ProposedGroup {
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

const byFileName = (a: GroupMember, b: GroupMember) => a.fileName.localeCompare(b.fileName)

/**
 * A zip's PSDs as piles of one product each (design/specs/pile-titles.md). They stay one pile when
 * every name shares a start (the test behind a "similar names" pile title) or every stem is the
 * same once variant suffixes are gone. Otherwise each stem is its own part: the largest keeps the
 * zip's name, a tie going to the part whose first file sorts first, and the others are named after
 * their stem through `archiveTitle`. A part of one is a mockup on its own.
 */
export function splitZip(members: GroupMember[]): GroupMember[][] {
  const sorted = [...members].sort(byFileName)
  if (sharedNameStart(sorted, sorted[0]!)) return [members]

  const byStem = new Map<string, GroupMember[]>()
  for (const m of sorted) {
    const stem = extractStem(m.fileName)
    byStem.set(stem, [...(byStem.get(stem) ?? []), m])
  }
  if (byStem.size === 1) return [members]

  // Largest first; equal sizes keep the order of their first file, which is how they were found.
  const parts = [...byStem.values()].sort((a, b) => b.length - a.length)
  return parts.map((part, i) => {
    if (i === 0 || part.length < 2) return part
    const title = variantFreeName(part[0]!.fileName)
    return part.map((m) => {
      const named = { ...m }
      delete named.archiveTitle
      return title ? { ...named, archiveTitle: title } : named
    })
  })
}
