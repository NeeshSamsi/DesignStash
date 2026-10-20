import type { TagTree } from '@shared/tags'
import type { TagTreeState } from './TagTree.types'

/** Figma's content (223:5509). Shown by a TagTree that is given no data, such as the catalog. */
export const SAMPLE_TREE: TagTree = [
  {
    categoryId: 1,
    categoryLabel: 'Device',
    tagCount: 3,
    tags: [
      { tagId: 1, label: 'iPhone 15 Pro', usageCount: 24 },
      { tagId: 2, label: 'iPhone', usageCount: 9 },
      { tagId: 3, label: 'iPad', usageCount: 8 }
    ]
  },
  {
    categoryId: 2,
    categoryLabel: 'Style',
    tagCount: 2,
    tags: [
      { tagId: 4, label: 'Clay', usageCount: 12 },
      { tagId: 5, label: 'Glass', usageCount: 7 }
    ]
  }
]

/** The tree a given Figma state starts from. `added` already holds the new tag. */
export function sampleTreeFor(state: TagTreeState): TagTree {
  if (state === 'empty' || state === 'loading') return []
  if (state !== 'added') return SAMPLE_TREE
  return SAMPLE_TREE.map((category) =>
    category.categoryId === 1
      ? {
          ...category,
          tagCount: 4,
          tags: [...category.tags, { tagId: 9, label: 'MacBook', usageCount: 0 }]
        }
      : category
  )
}
