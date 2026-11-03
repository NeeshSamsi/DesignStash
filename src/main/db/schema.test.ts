import { getTableColumns } from 'drizzle-orm'
import { describe, it, expect } from 'vitest'
import { mockups } from './schema'

describe('DB Schemas', () => {
  it('mockups table should have the correct columns', () => {
    const columns = getTableColumns(mockups)
    expect(columns.id).toBeDefined()
    expect(columns.title).toBeDefined()
    expect(columns.description).toBeDefined()
    expect(columns.libraryPath).toBeDefined()
    expect(columns.coverPath).toBeDefined()
    expect(columns.coverSource).toBeDefined()
    expect(columns.stage).toBeDefined()
    expect(columns.contentHash).toBeDefined()
    expect(columns.importContext).toBeDefined()
    expect(columns.isGroup).toBeDefined()
    expect(columns.groupId).toBeDefined()
    expect(columns.favourite).toBeDefined()
    expect(columns.favouritedAt).toBeDefined()
    expect(columns.deletedAt).toBeDefined()
    expect(columns.createdAt).toBeDefined()
    expect(columns.updatedAt).toBeDefined()
  })
})
