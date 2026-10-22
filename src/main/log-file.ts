import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface LogFileOptions {
  /** The folder the files live in (userData/logs). */
  dir: string
  /** Size at which the current file rolls over. */
  maxBytes?: number
  /** How many files are kept, the current one included. */
  files?: number
  /** Applied to every line before it is written, so no path reaches the disk. */
  scrub?: (line: string) => string
}

export interface LogFile {
  write(line: string): void
  /** The last `lines` lines across the kept files, oldest first. */
  tail(lines: number): string
}

const BASE = 'designstash'

/**
 * A small rotating log: designstash.log is the current file; when it fills it becomes
 * designstash.1.log and so on, and the oldest is dropped. Writing never throws, because logging
 * must not take the app down.
 */
export function createLogFile(opts: LogFileOptions): LogFile {
  const maxBytes = opts.maxBytes ?? 1024 * 1024
  const files = Math.max(1, opts.files ?? 3)
  const scrub = opts.scrub ?? ((s: string) => s)
  const nameOf = (i: number) => join(opts.dir, i === 0 ? `${BASE}.log` : `${BASE}.${i}.log`)
  let size = -1

  function currentSize(): number {
    if (size >= 0) return size
    try {
      size = statSync(nameOf(0)).size
    } catch {
      size = 0
    }
    return size
  }

  function rotate(): void {
    rmSync(nameOf(files - 1), { force: true })
    for (let i = files - 2; i >= 0; i--) {
      if (existsSync(nameOf(i))) renameSync(nameOf(i), nameOf(i + 1))
    }
    size = 0
  }

  return {
    write(line) {
      try {
        mkdirSync(opts.dir, { recursive: true })
        const text = `${scrub(line).replace(/\r?\n/g, '\n')}\n`
        if (currentSize() > 0 && currentSize() + Buffer.byteLength(text) > maxBytes) rotate()
        appendFileSync(nameOf(0), text, 'utf-8')
        size = currentSize() + Buffer.byteLength(text)
      } catch {
        // Nowhere to report a logging failure to.
      }
    },
    tail(lines) {
      const out: string[] = []
      for (let i = files - 1; i >= 0; i--) {
        try {
          out.push(...readFileSync(nameOf(i), 'utf-8').split('\n').filter((l) => l.length > 0))
        } catch {
          // A missing file is just a shorter history.
        }
      }
      return out.slice(-lines).join('\n')
    }
  }
}
