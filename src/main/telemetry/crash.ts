import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Crash bookkeeping. Electron's crashReporter writes minidumps locally (uploadToServer: false).
 * A dump says that something crashed; the process type comes from the `*-process-gone` events we
 * noted while the app was still running. A dump with no matching note is the main process, which
 * cannot note its own death.
 */

export interface CrashEntry {
  at: string
  type: string
}

interface CrashState {
  /** Dumps older than this were already looked at. ISO. */
  checkedAt: string | null
  /** Process-gone notes made since the last check. */
  gone: CrashEntry[]
  /** The crashes already reported or seen, newest last. */
  history: CrashEntry[]
}

const HISTORY_KEEP = 20
const RECENT_DAYS = 7

function read(file: string): CrashState {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Partial<CrashState>
    return {
      checkedAt: typeof parsed.checkedAt === 'string' ? parsed.checkedAt : null,
      gone: Array.isArray(parsed.gone) ? parsed.gone : [],
      history: Array.isArray(parsed.history) ? parsed.history : []
    }
  } catch {
    return { checkedAt: null, gone: [], history: [] }
  }
}

function write(file: string, state: CrashState): void {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(state), 'utf-8')
  } catch {
    // Bookkeeping only; losing it loses a count, not data.
  }
}

/** Note that a renderer or helper process died abnormally. Called from `*-process-gone`. */
export function noteProcessGone(file: string, type: string, now: Date = new Date()): void {
  const state = read(file)
  state.gone.push({ at: now.toISOString(), type })
  write(file, state)
}

function dumpTimes(dumpsDir: string): number[] {
  const times: number[] = []
  for (const sub of ['completed', 'pending', 'new']) {
    const dir = join(dumpsDir, sub)
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.dmp')) continue
      try {
        times.push(statSync(join(dir, name)).mtimeMs)
      } catch {
        // Gone between listing and stat.
      }
    }
  }
  return times.sort((a, b) => a - b)
}

/**
 * Crashes that happened since the last call: one entry per new dump. The first ever call (no
 * `checkedAt`) only sets the baseline, so dumps from before this feature are not reported.
 */
export function takeNewCrashes(opts: {
  dumpsDir: string
  stateFile: string
  now?: Date
}): CrashEntry[] {
  const now = opts.now ?? new Date()
  const state = read(opts.stateFile)
  const since = state.checkedAt ? Date.parse(state.checkedAt) : Number.POSITIVE_INFINITY
  const fresh = dumpTimes(opts.dumpsDir).filter((t) => t > since)
  const notes = [...state.gone]
  const crashes: CrashEntry[] = fresh.map((t) => ({
    at: new Date(t).toISOString(),
    type: notes.shift()?.type ?? 'main'
  }))
  write(opts.stateFile, {
    checkedAt: now.toISOString(),
    gone: [],
    history: [...state.history, ...crashes].slice(-HISTORY_KEEP)
  })
  return crashes
}

/** A line for the problem report: how many crashes in the last week and the latest one's kind. */
export function recentCrashLine(stateFile: string, now: Date = new Date()): string {
  const cutoff = now.getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000
  const recent = read(stateFile).history.filter((c) => Date.parse(c.at) >= cutoff)
  const last = recent.at(-1)
  if (!last) return 'none in the last 7 days'
  return `${recent.length} in the last 7 days, latest ${last.type} on ${last.at.slice(0, 10)}`
}
