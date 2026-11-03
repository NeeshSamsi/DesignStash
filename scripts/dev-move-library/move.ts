import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { basename, join, sep } from 'node:path'
import { rewriteStashPaths } from '../../src/main/library/stash-folder-service'

export interface MoveOptions {
  /** The folder dev and the installed app shared (`designstash`, the same as `DesignStash`). */
  from: string
  /** Dev's own folder (`DesignStash-dev`), which may already hold models and llama-server. */
  to: string
  /** Where the clone of `from` goes before anything moves. */
  backupDir: string
  /** Why the move can't run now, or null. Gets both folders and the library's database. */
  busy?: (folders: string[], dbPath: string | null) => string | null
  /** An APFS clone of a folder: instant, and no extra space until something changes. */
  clone?: (src: string, dest: string) => void
  log?: (line: string) => void
}

export type MoveResult = { moved: true; libraryRoot: string } | { moved: false; reason: string }

/** `path` moved from `from` to `to` when it is inside `from`. macOS disks ignore case. */
function rebase(path: string, from: string, to: string): string {
  const lower = path.toLowerCase()
  const base = from.toLowerCase()
  if (lower === base) return to
  if (lower.startsWith(base + sep)) return to + path.slice(from.length)
  return path
}

/** Every string in a JSON value that is a path inside `from`, moved to `to`. */
function rebaseAll(value: unknown, from: string, to: string): unknown {
  if (typeof value === 'string') return rebase(value, from, to)
  if (Array.isArray(value)) return value.map((v) => rebaseAll(v, from, to))
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rebaseAll(v, from, to)]))
  return value
}

function writeWhole(path: string, data: string): void {
  writeFileSync(`${path}.tmp`, data)
  renameSync(`${path}.tmp`, path)
}

/** The pid behind a folder's Chromium single-instance lock, when that process is still running. */
export function liveSingleton(folder: string): number | null {
  try {
    const pid = Number(/-(\d+)$/.exec(readlinkSync(join(folder, 'SingletonLock')))?.[1])
    if (!pid) return null
    process.kill(pid, 0)
    return pid
  } catch {
    return null
  }
}

/** An app on either folder, the installed app at all, or anything holding the database open. */
export function defaultBusy(folders: string[], dbPath: string | null): string | null {
  for (const folder of folders) {
    const pid = liveSingleton(folder)
    if (pid) return `an app is running on ${folder} (pid ${pid}); quit it first`
  }
  const run = (cmd: string, args: string[]): string => {
    try {
      return execFileSync(cmd, args, { encoding: 'utf8' }).trim()
    } catch {
      return '' // pgrep and lsof exit 1 when they find nothing.
    }
  }
  if (run('pgrep', ['-f', 'DesignStash.app/Contents/MacOS/DesignStash']))
    return 'the installed DesignStash is running; quit it first'
  const holders = dbPath ? run('lsof', ['-t', dbPath]) : ''
  if (holders)
    return `the library's database is open (pid ${holders.split('\n').join(', ')}); quit the app first`
  return null
}

/**
 * Moves dev's library and settings out of the folder dev and the installed app shared, into dev's
 * own. A clone of the shared folder goes to `backupDir` first. Everything in it moves across except
 * what dev's folder already has (its models are kept, and only the models it lacks join them);
 * then every path in settings.json, the stash note and the library's database points at the new
 * place, and the shared folder is removed, so the installed app starts fresh. A stash folder
 * outside the shared folder stays where it is.
 */
export function moveDevLibrary(opts: MoveOptions): MoveResult {
  const { from, to, backupDir } = opts
  const busy = opts.busy ?? defaultBusy
  const clone = opts.clone ?? ((src, dest) => execFileSync('cp', ['-c', '-R', src, dest]))
  const log = opts.log ?? (() => {})

  const settingsPath = join(from, 'settings.json')
  if (!existsSync(settingsPath))
    return { moved: false, reason: `no settings.json in ${from}: nothing to move` }
  if (existsSync(join(to, 'settings.json')))
    return { moved: false, reason: `${to} already has settings.json: has the move run already?` }
  let settings: Record<string, unknown>
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>
  } catch {
    return { moved: false, reason: `${settingsPath} can't be read` }
  }
  const oldRoot =
    typeof settings.libraryRoot === 'string' ? settings.libraryRoot : join(from, 'Library')
  const newRoot = rebase(oldRoot, from, to)
  const dbPath = join(oldRoot, 'designstash.db')
  const reason = busy([from, to], existsSync(dbPath) ? dbPath : null)
  if (reason) return { moved: false, reason }

  mkdirSync(backupDir, { recursive: true })
  clone(from, join(backupDir, basename(from)))
  log(`backup: ${join(backupDir, basename(from))}`)

  mkdirSync(to, { recursive: true })
  for (const name of readdirSync(from)) {
    // Chromium's single-instance files belong to a run that is over.
    if (name.startsWith('Singleton')) continue
    const src = join(from, name)
    const dest = join(to, name)
    if (!existsSync(dest)) {
      renameSync(src, dest)
      log(`moved ${name}`)
    } else if (name === 'models') {
      for (const model of readdirSync(src)) {
        if (existsSync(join(dest, model))) continue
        renameSync(join(src, model), join(dest, model))
        log(`moved models/${model}`)
      }
    } else {
      log(`kept dev's own ${name}`)
    }
  }

  writeWhole(join(to, 'settings.json'), JSON.stringify(rebaseAll(settings, from, to), null, 2))
  const note = join(to, 'stash-root')
  if (existsSync(note)) writeWhole(note, rebase(readFileSync(note, 'utf8').trim(), from, to))
  const newDb = join(newRoot, 'designstash.db')
  if (newRoot !== oldRoot && existsSync(newDb)) {
    // The database's paths were written from the settings' libraryRoot, so it is matched as written.
    rewriteStashPaths(newDb, oldRoot, newRoot)
    log(`pointed the library's paths at ${newRoot}`)
  }

  rmSync(from, { recursive: true, force: true })
  log(`removed ${from}: the installed app starts fresh`)
  return { moved: true, libraryRoot: newRoot }
}
