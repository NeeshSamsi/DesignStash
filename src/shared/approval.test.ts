import { describe, expect, it } from 'vitest'
import { StashSnapshotSchema } from './approval'

describe('StashSnapshotSchema', () => {
  const oldSnapshot = {
    mockups: [
      {
        id: 1,
        title: 'a',
        description: null,
        tagIds: [2],
        // Snapshots taken before review status was dropped still carry it.
        reviewStatus: 'needs_review',
        stage: 'to_stash',
        sortedAt: null
      }
    ],
    drafts: [],
    resume: null
  }

  it('still reads a snapshot that carries the dropped reviewStatus, and drops the field', () => {
    const parsed = StashSnapshotSchema.parse(oldSnapshot)
    expect(parsed.mockups[0]).toEqual({
      id: 1,
      title: 'a',
      description: null,
      tagIds: [2],
      stage: 'to_stash',
      sortedAt: null
    })
  })
})
