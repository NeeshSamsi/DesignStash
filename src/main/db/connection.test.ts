import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initDb, getDb, getSqlite, closeDb } from './connection'

const dirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ds-conn-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  closeDb()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('connection', () => {
  it('throws if getDb() is called before initDb()', () => {
    expect(() => getDb()).toThrow('Database not initialized')
  })

  it('throws if getSqlite() is called before initDb()', () => {
    expect(() => getSqlite()).toThrow('Database not initialized')
  })

  it('initDb() returns a working database instance', () => {
    const dir = tempDir()
    const db = initDb(join(dir, 'test.db'))
    expect(db).toBeTruthy()
  })

  it('initDb() is idempotent — second call returns the same instance', () => {
    const dir = tempDir()
    const db1 = initDb(join(dir, 'test.db'))
    const db2 = initDb(join(dir, 'test.db'))
    expect(db1).toBe(db2)
  })

  it('getDb() returns the initialized db after initDb()', () => {
    const dir = tempDir()
    const db = initDb(join(dir, 'test.db'))
    expect(getDb()).toBe(db)
  })

  it('closeDb() clears state — getDb() throws again after close', () => {
    const dir = tempDir()
    initDb(join(dir, 'test.db'))
    closeDb()
    expect(() => getDb()).toThrow('Database not initialized')
  })

  it('WAL mode is enabled', () => {
    const dir = tempDir()
    initDb(join(dir, 'test.db'))
    const result = getSqlite().pragma('journal_mode', { simple: true })
    expect(result).toBe('wal')
  })

  it('foreign keys are enforced', () => {
    const dir = tempDir()
    initDb(join(dir, 'test.db'))
    const result = getSqlite().pragma('foreign_keys', { simple: true })
    expect(result).toBe(1)
  })
})
