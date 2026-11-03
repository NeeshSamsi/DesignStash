import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../../schema'
import type { NewMockup } from '../../schema'
import { Repository } from '../../repository'

export interface TestDb {
  sqlite: Database.Database
  db: BetterSQLite3Database<typeof schema>
  repo: Repository
}

export function createTestDb(): TestDb {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './drizzle' })
  return { sqlite, db, repo: new Repository(db) }
}

export const sample: NewMockup = {
  title: 'MacBook Mockup',
  libraryPath: '/lib/mockups/abc/original.psd',
  coverPath: '/lib/mockups/abc/cover.png',
  coverSource: 'embedded'
}

export const batchSample = (batchId: string): NewMockup => ({
  title: 'Test Mockup',
  libraryPath: `/lib/mockups/${batchId}/original.psd`,
  coverPath: `/lib/mockups/${batchId}/cover.png`,
  coverSource: 'embedded',
  importContext: { batchId, folderTrail: [], originalFilename: 'x.psd' }
})

export const approvedMockup = (overrides: Partial<NewMockup> = {}): NewMockup => ({
  title: 'Mockup',
  libraryPath: '/lib/x.psd',
  coverPath: '/c.png',
  coverSource: 'embedded' as const,
  reviewStatus: 'approved',
  ...overrides
})
