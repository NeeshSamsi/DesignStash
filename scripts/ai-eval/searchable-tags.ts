import { TAXONOMY } from '../../src/main/db/bootstrap'
import type { Repository } from '../../src/main/db/repository'
import { TagService } from '../../src/main/db/tag-service'
import { normaliseTagLabel } from '../../src/shared/tags'

export interface TagPair {
  category: string
  label: string
}

interface Row {
  id: number
  label: string
}

/**
 * The tag table without a database: the seed taxonomy, plus whatever a run adds. It answers the
 * four lookups `TagService.snapTags` makes, the same way `TagsRepository` does (first match by
 * normalised label, in id order).
 */
class MemoryTags {
  private nextId = 1
  readonly categories: Row[] = []
  readonly tags: (Row & { categoryId: number })[] = []

  constructor() {
    for (const category of TAXONOMY) {
      const cat = this.createCategory({ label: category.label })
      for (const label of category.tags) this.createTag({ label, categoryId: cat.id })
    }
  }

  getCategoryByNormalisedLabel(label: string): Row | undefined {
    const wanted = normaliseTagLabel(label)
    return this.categories.find((c) => normaliseTagLabel(c.label) === wanted)
  }

  createCategory(data: { label: string }): Row {
    const row = { id: this.nextId++, label: data.label }
    this.categories.push(row)
    return row
  }

  getTagByNormalisedLabel(categoryId: number, label: string): Row | undefined {
    const wanted = normaliseTagLabel(label)
    if (!wanted) return undefined
    return this.tags.find(
      (t) => t.categoryId === categoryId && normaliseTagLabel(t.label) === wanted
    )
  }

  createTag(data: { label: string; categoryId: number }): Row {
    const row = { id: this.nextId++, label: data.label, categoryId: data.categoryId }
    this.tags.push(row)
    return row
  }

  pair(tagId: number): TagPair {
    const tag = this.tags.find((t) => t.id === tagId)!
    return {
      category: this.categories.find((c) => c.id === tag.categoryId)!.label,
      label: tag.label
    }
  }
}

/**
 * Turns a model's tags into the tags a mockup is saved with, by the app's own `snapTags`: snapped
 * to labels already there ("iphone" becomes the seed "iPhone"), new ones kept as written, repeats
 * dropped. One snapper is shared across a run, as one library is, so a label the model invents for
 * one item is what the next item's spelling of it snaps to.
 */
export function createTagSnapper(): (tags: TagPair[]) => Promise<TagPair[]> {
  const memory = new MemoryTags()
  const service = new TagService({ tags: memory } as unknown as Repository)
  return async (tags) => (await service.snapTags(tags)).map((id) => memory.pair(id))
}

/** The tags column of the search index: labels joined by spaces, as `SearchRepository.upsertSearchIndex` writes it. */
export function tagsColumn(tags: TagPair[]): string {
  return tags.map((t) => t.label).join(' ')
}
