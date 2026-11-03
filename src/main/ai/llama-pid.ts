import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { basename } from 'node:path'

/** What the pid file needs from the system, so tests can hand in stubs. */
export interface LlamaPidDeps {
  readFile(path: string): Promise<string>
  writeFile(path: string, text: string): Promise<void>
  rm(path: string): Promise<void>
  /** The command name of a running process, or null when there is none with that pid. */
  commandOf(pid: number): Promise<string | null>
  kill(pid: number, signal: NodeJS.Signals): void
}

const defaultDeps: LlamaPidDeps = {
  readFile: (p) => fs.readFile(p, 'utf8'),
  writeFile: (p, text) => fs.writeFile(p, text, 'utf8'),
  rm: (p) => fs.rm(p, { force: true }),
  commandOf: (pid) =>
    new Promise((resolve) => {
      execFile('ps', ['-p', String(pid), '-o', 'comm='], (err, stdout) => {
        const name = stdout.trim()
        resolve(err || !name ? null : name)
      })
    }),
  kill: (pid, signal) => process.kill(pid, signal)
}

/**
 * Remembers which llama-server this app started, in a small file. If the app is killed outright
 * its exit hook never runs and the server keeps going; the next launch reads the file and stops
 * that server. The command name is checked first, so a pid that has since been given to some
 * other program is never touched.
 */
export class LlamaPidFile {
  private readonly deps: LlamaPidDeps

  constructor(
    private readonly path: string,
    deps?: Partial<LlamaPidDeps>
  ) {
    this.deps = { ...defaultDeps, ...deps }
  }

  async record(pid: number): Promise<void> {
    await this.deps.writeFile(this.path, String(pid)).catch(() => {})
  }

  async clear(): Promise<void> {
    await this.deps.rm(this.path).catch(() => {})
  }

  /** Stop a llama-server left behind by an earlier run. Returns whether one was stopped. */
  async reapStale(): Promise<boolean> {
    let pid: number
    try {
      pid = Number.parseInt((await this.deps.readFile(this.path)).trim(), 10)
    } catch {
      return false
    }
    await this.clear()
    if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) return false

    const command = await this.deps.commandOf(pid)
    if (!command || basename(command) !== 'llama-server') return false
    try {
      this.deps.kill(pid, 'SIGKILL')
      return true
    } catch {
      return false
    }
  }
}
