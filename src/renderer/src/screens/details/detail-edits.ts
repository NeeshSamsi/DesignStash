import type { ApprovalTag } from '@shared/approval'
import type { CoverSource, MockupDetail } from '@shared/library'
import type { TagTree } from '@shared/tags'

/** The three things Detail edits. */
export interface DetailDraft {
  title: string
  description: string
  tagIds: number[]
}

/** What the person has typed, with the tags as the editor holds them. */
export interface DetailForm {
  title: string
  description: string
  tags: ApprovalTag[]
}

export const EMPTY_TITLE_REASON = 'Add a title to save'

export const draftOf = (form: DetailForm): DetailDraft => ({
  title: form.title,
  description: form.description,
  tagIds: form.tags.map((tag) => tag.tagId)
})

const sameTagIds = (a: readonly number[], b: readonly number[]) => {
  if (a.length !== b.length) return false
  const sorted = [...b].sort((x, y) => x - y)
  return [...a].sort((x, y) => x - y).every((id, index) => id === sorted[index])
}

/** True once anything differs from what was saved. Tag order doesn't count. */
export function isDirty(saved: DetailDraft, current: DetailDraft): boolean {
  return (
    saved.title !== current.title ||
    saved.description !== current.description ||
    !sameTagIds(saved.tagIds, current.tagIds)
  )
}

/** Why Save is off, or null when it can save. An empty title is the only reason. */
export function saveBlockedReason(draft: Pick<DetailDraft, 'title'>): string | null {
  return draft.title.trim() === '' ? EMPTY_TITLE_REASON : null
}

/** The form for a loaded mockup. Tags need their category ids, which the tag tree has. */
export function formFromDetail(detail: MockupDetail, tree: TagTree): DetailForm {
  const categoryIds = new Map(tree.map((category) => [category.categoryLabel, category.categoryId]))
  return {
    title: detail.item.title,
    description: detail.item.description ?? '',
    tags: detail.item.tags.map((tag) => ({
      tagId: tag.id,
      label: tag.label,
      categoryId: categoryIds.get(tag.categoryLabel) ?? 0,
      categoryLabel: tag.categoryLabel
    }))
  }
}

export type PanelSource = 'embedded' | 'sidecar' | 'uploaded' | 'none'

/** How the cover panel names where a cover came from. No file at all is the drop zone. */
export function panelSource(coverPath: string, coverSource: CoverSource): PanelSource {
  if (coverPath === '') return 'none'
  if (coverSource === 'user-uploaded') return 'uploaded'
  if (coverSource === 'sidecar') return 'sidecar'
  if (coverSource === 'none') return 'none'
  return 'embedded'
}

/** What Photoshop failing to open looks like to the person: no codes, no paths. */
export function photoshopFailureCopy(reason: 'no-app' | 'failed'): {
  title: string
  description: string
} {
  return reason === 'no-app'
    ? {
        title: 'Photoshop isn’t installed',
        description: 'We couldn’t find Photoshop on this Mac. Install it, then try again.'
      }
    : {
        title: 'Photoshop didn’t open',
        description: 'Something got in the way of opening this file. Try again in a moment.'
      }
}
