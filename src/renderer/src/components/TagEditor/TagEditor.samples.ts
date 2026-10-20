import type { ApprovalTag } from '@shared/approval'

/** Figma content (222:2959). Shown by a TagEditor that is given no data, such as the catalog. */
export const SAMPLE_TAGS: ApprovalTag[] = [
  { tagId: 1, label: 'iPhone 15 Pro', categoryId: 1, categoryLabel: 'Device' },
  { tagId: 2, label: 'Clay', categoryId: 2, categoryLabel: 'Style' },
  { tagId: 3, label: 'Studio', categoryId: 3, categoryLabel: 'Scene' }
]

export const SAMPLE_SUGGESTIONS: ApprovalTag[] = [
  { tagId: 4, label: 'Beige', categoryId: 4, categoryLabel: 'Colour' },
  { tagId: 5, label: 'Warm', categoryId: 5, categoryLabel: 'Mood' }
]

export interface TagVocabularyCategory {
  categoryId: number
  categoryLabel: string
  tags: { tagId: number; label: string; usageCount: number }[]
}

export const SAMPLE_VOCABULARY: TagVocabularyCategory[] = [
  {
    categoryId: 4,
    categoryLabel: 'Colour',
    tags: [
      { tagId: 4, label: 'Beige', usageCount: 12 },
      { tagId: 6, label: 'Bone', usageCount: 3 }
    ]
  },
  {
    categoryId: 3,
    categoryLabel: 'Scene',
    tags: [
      { tagId: 3, label: 'Studio', usageCount: 20 },
      { tagId: 7, label: 'Beach', usageCount: 5 }
    ]
  },
  { categoryId: 2, categoryLabel: 'Style', tags: [{ tagId: 2, label: 'Clay', usageCount: 9 }] },
  {
    categoryId: 1,
    categoryLabel: 'Device',
    tags: [{ tagId: 1, label: 'iPhone 15 Pro', usageCount: 31 }]
  },
  { categoryId: 5, categoryLabel: 'Mood', tags: [{ tagId: 5, label: 'Warm', usageCount: 8 }] }
]
