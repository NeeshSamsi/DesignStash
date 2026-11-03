import { existsSync, readdirSync, rmSync, rmdirSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import Database from 'better-sqlite3'
import type { StashChangeMode, StashChangeResult, StashInfo, StashMoveProgress } from '@shared/stash'
import { getSqlite } from '../db/connection'
import type { Repository } from '../db/repository'
import type { SettingsStore } from '../settings'
import { ensureSizes } from './app-files'

const DB_FILE = 'designstash.db'
/** What belongs to the stash inside its folder. Anything else in there is the user's. */
const STASH_ENTRIES = [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`, 'config.json', 'mockups', 'covers']
/** Folders and files copied one by one. The database is copied by SQLite itself. */
const COPIED_ENTRIES = ['config.json', 'mockups', 'covers']

export interface StashFolderDeps {
  stat: (path: string) => Promise<{ size: number }>
  copyFile: (src: string, dest: string) => Promise<void>
  mkdir: (path: string) => Promise<void>
  freeBytes: (path: string) => Promise<number>
  /** A consistent copy of the live database. */
  backupDb: (dest: string) => Promise<void>
  /** Point the paths in a database copy at the new folder. */
  rewritePaths: (dbPath: string, from: string, to: string) => void
}

const defaultDeps: StashFolderDeps = {
  stat: (p) => fs.stat(p),
  copyFile: (src, dest) => fs.copyFile(src, dest),
  mkdir: async (p) => {
    await fs.mkdir(p, { recursive: true })
  },
  freeBytes: async (p) => {
    const s = await fs.statfs(p)
    return s.bavail * s.bsize
  },
  backupDb: async (dest) => {
    await getSqlite().backup(dest)
  },
  rewritePaths: (dbPath, from, to) => {
    const db = new Database(dbPath)
    try {
      const prefix = from.endsWith(sep) ? from : from + sep
      const next = to.endsWith(sep) ? to : to + sep
      db.transaction(() => {
        for (const [table, column] of [
          ['mockups', 'library_path'],
          ['mockups', 'cover_path'],
          ['variants', 'library_path'],
          ['variants', 'cover_path']
        ] as const) {
          db.prepare(
            `UPDATE ${table} SET ${column} = ? || substr(${column}, ?) WHERE substr(${column}, 1, ?) = ?`
          ).run(next, prefix.length + 1, prefix.length, prefix)
        }
      })()
    } finally {
      db.close()
    }
  }
}

interface FileEntry {
  rel: string
  size: number
}

async function listFiles(root: string, rel = ''): Promise<FileEntry[]> {
  const out: FileEntry[] = []
  const dir = rel ? join(root, rel) : root
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const childRel = rel ? join(rel, e.name) : e.name
    if (e.isDirectory()) out.push(...(await listFiles(root, childRel)))
    else if (e.isFile()) out.push({ rel: childRel, size: (await fs.stat(join(root, childRel))).size })
  }
  return out
}

async function listStashFiles(root: string): Promise<FileEntry[]> {
  const out: FileEntry[] = []
  for (const entry of COPIED_ENTRIES) {
    const path = join(root, entry)
    const stat = await fs.stat(path).catch(() => null)
    if (!stat) continue
    if (stat.isDirectory()) out.push(...(await listFiles(root, entry)))
    else out.push({ rel: entry, size: stat.size })
  }
  return out
}

const NOT_WRITABLE = new Set(['EACCES', 'EPERM', 'EROFS'])

/**
 * The stash folder in Settings: what is in it, and changing where it lives. A change never
 * touches the folder in use. A move copies and checks the copy, then waits for a restart; at the
 * next launch `applyPendingStash` switches over and clears the old folder.
 */
export class StashFolderService {
  private readonly deps: StashFolderDeps

  constructor(
    private readonly repo: Repository,
    private readonly settings: SettingsStore,
    deps?: Partial<StashFolderDeps>,
    private readonly onProgress: (progress: StashMoveProgress) => void = () => {}
  ) {
    this.deps = { ...defaultDeps, ...deps }
  }

  async info(): Promise<StashInfo> {
    const { libraryRoot, pendingStash } = this.settings.get()
    const ids = this.repo.mockups.getAllLibraryPaths().map((p) => p.mockupId)
    const sizes = await ensureSizes(this.repo, this.deps.stat, ids)
    return {
      path: pendingStash?.path ?? libraryRoot,
      count: ids.length,
      bytes: [...sizes.values()].reduce<number>((sum, s) => sum + (s ?? 0), 0),
      restartRequired: pendingStash !== null
    }
  }

  async change(path: string, mode: StashChangeMode): Promise<StashChangeResult> {
    const root = this.settings.getLibraryRoot()
    if (path === root) return { ok: false, reason: 'same-folder' }
    if (path.startsWith(root + sep)) return { ok: false, reason: 'inside-stash' }

    const stat = await fs.stat(path).catch(() => null)
    if (stat && !stat.isDirectory()) return { ok: false, reason: 'not-a-folder' }

    if (mode === 'point') {
      if (!stat) return { ok: false, reason: 'not-a-folder' }
      this.settings.update({ pendingStash: { path, mode, oldRoot: root } })
      return { ok: true, restartRequired: true }
    }
    return this.move(root, path, stat !== null)
  }

  private async move(root: string, target: string, existed: boolean): Promise<StashChangeResult> {
    if (existed) {
      const entries = (await fs.readdir(target)).filter((n) => n !== '.DS_Store')
      if (entries.length > 0) return { ok: false, reason: 'not-empty' }
    }

    const files = await listStashFiles(root)
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
    const dbBytes = await this.deps.stat(join(root, DB_FILE)).then((s) => s.size, () => 0)

    // Room for everything (with a margin on the database, which can grow while copying) before writing a byte.
    const nearest = existed ? target : await nearestExisting(target)
    if ((await this.deps.freeBytes(nearest)) < totalBytes + Math.ceil(dbBytes * 1.1)) {
      return { ok: false, reason: 'no-space' }
    }

    try {
      if (!existed) await this.deps.mkdir(target)
    } catch (err) {
      return { ok: false, reason: NOT_WRITABLE.has((err as NodeJS.ErrnoException).code ?? '') ? 'not-writable' : 'failed' }
    }

    let copiedBytes = 0
    const report = (phase: StashMoveProgress['phase'], copiedFiles: number): void =>
      this.onProgress({ phase, copiedFiles, totalFiles: files.length, copiedBytes, totalBytes })

    try {
      report('copying', 0)
      let copied = 0
      for (const file of files) {
        const dest = join(target, file.rel)
        await fs.mkdir(dirname(dest), { recursive: true })
        await this.deps.copyFile(join(root, file.rel), dest)
        copiedBytes += file.size
        report('copying', ++copied)
      }

      report('verifying', copied)
      await this.deps.backupDb(join(target, DB_FILE))
      this.deps.rewritePaths(join(target, DB_FILE), root, target)
      if (!(await this.matches(files, target))) {
        await this.cleanUp(target, existed)
        return { ok: false, reason: 'verify-failed' }
      }

      report('finishing', copied)
      this.settings.update({ pendingStash: { path: target, mode: 'move', oldRoot: root } })
      return { ok: true, restartRequired: true }
    } catch (err) {
      await this.cleanUp(target, existed)
      return { ok: false, reason: NOT_WRITABLE.has((err as NodeJS.ErrnoException).code ?? '') ? 'not-writable' : 'failed' }
    }
  }

  /** Same files, same sizes, plus the database. */
  private async matches(expected: FileEntry[], target: string): Promise<boolean> {
    const actual = (await listStashFiles(target)).sort((a, b) => a.rel.localeCompare(b.rel))
    const wanted = [...expected].sort((a, b) => a.rel.localeCompare(b.rel))
    if (actual.length !== wanted.length) return false
    if (!actual.every((f, i) => f.rel === wanted[i]!.rel && f.size === wanted[i]!.size)) return false
    return existsSync(join(target, DB_FILE))
  }

  /** Remove only what this move wrote. A folder that was already there stays, empty. */
  private async cleanUp(target: string, existed: boolean): Promise<void> {
    if (!existed) {
      await fs.rm(target, { recursive: true, force: true })
      return
    }
    for (const entry of [...COPIED_ENTRIES, DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) {
      await fs.rm(join(target, entry), { recursive: true, force: true })
    }
  }
}

async function nearestExisting(path: string): Promise<string> {
  let current = path
  while (!(await fs.stat(current).then(() => true, () => false))) {
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return current
}

/**
 * Run at launch, before the database is opened. Switches to a stash folder chosen last time and, for
 * a move, clears the old folder once the new copy is confirmed. If the new copy has gone missing, the
 * old folder stays in use.
 */
export function applyPendingStash(settings: SettingsStore): void {
  const pending = settings.get().pendingStash
  if (!pending) return

  if (pending.mode === 'point') {
    settings.update({ libraryRoot: pending.path, pendingStash: null })
    return
  }

  if (!existsSync(join(pending.path, DB_FILE))) {
    settings.update({ pendingStash: null })
    return
  }
  settings.update({ libraryRoot: pending.path, pendingStash: null })
  for (const entry of STASH_ENTRIES) rmSync(join(pending.oldRoot, entry), { recursive: true, force: true })
  try {
    if (readdirSync(pending.oldRoot).length === 0) rmdirSync(pending.oldRoot)
  } catch {
    // Not empty or already gone: leave it.
  }
}
