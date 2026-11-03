import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { z } from 'zod'
import {
  ClassifyResultSchema,
  DescribeResultSchema,
  FeaturePrintResultSchema,
  HelperInfoSchema,
  HelperReplySchema,
  OcrResultSchema,
  PeopleResultSchema,
  type ClassifyResult,
  type DescribeResult,
  type FeaturePrintResult,
  type HelperInfo,
  type OcrResult,
  type PeopleResult
} from './helper-schemas'

export const HELPER_BINARY = 'designstash-helper'

/**
 * Where the Swift helper lives: `DESIGNSTASH_HELPER` if set, then the app's bundled resources
 * (electron-builder.yml ships it to `<resources>/helper/`), then the development copy that
 * `pnpm helper:build` puts outside the repo.
 * Null when none exists: the helper is then unavailable, and nothing that uses it crashes.
 */
export function resolveHelperPath(
  env: NodeJS.ProcessEnv = process.env,
  resourcesPath: string | undefined = process.resourcesPath,
  home: string = homedir(),
  exists: (path: string) => boolean = existsSync
): string | null {
  const candidates = [
    env.DESIGNSTASH_HELPER,
    resourcesPath ? join(resourcesPath, 'helper', HELPER_BINARY) : undefined,
    join(home, 'Library', 'Application Support', 'DesignStash-dev', 'helper', HELPER_BINARY)
  ]
  return candidates.find((p): p is string => !!p && exists(p)) ?? null
}

/**
 * A failed helper call. `code` is the helper's own error code (`not_found`, `unreadable_image`,
 * `unavailable`, `bad_schema`, `refused` and the rest, native/designstash-helper/README.md) or
 * one of the client's: `unavailable` (no binary, or it can't be run), `timeout`, `crashed`,
 * `stopped` and `bad_reply`.
 */
export class HelperError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'HelperError'
  }
}

export interface NativeHelperConfig {
  /** The binary, from `resolveHelperPath`. Null means the helper is unavailable. */
  binaryPath: string | null
  /** Arguments for the binary. Tests use them to run a fake helper script with node. */
  args?: readonly string[]
  /** Stop the helper after this long without a call. Default 5 minutes. */
  idleMs?: number
  /** How long a Vision call may take. Default 60 s: the very first OCR on a Mac took 35 s. */
  timeoutMs?: number
  /** How long `describe` may take, model load included. Default 2 minutes. */
  describeTimeoutMs?: number
}

export interface NativeHelperDeps {
  spawn(command: string, args: string[]): ChildProcessWithoutNullStreams
  /** Kill the child if the app quits under it. Returns a function that unregisters. */
  onParentExit(listener: () => void): () => void
}

export const defaultNativeHelperDeps: NativeHelperDeps = {
  spawn: (command, args) => nodeSpawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] }),
  onParentExit: (listener) => {
    process.once('exit', listener)
    return () => process.off('exit', listener)
  }
}

export interface OcrOptions {
  /** `accurate` (default) or `fast`, which misreads most mockup text. */
  level?: 'accurate' | 'fast'
  languageCorrection?: boolean
  minConfidence?: number
}

export interface DescribeRequest {
  /** The image to show the model, or null to ask from the text alone. */
  imagePath: string | null
  instructions: string
  prompt: string
  /** A JSON-schema-like object; the reply is then JSON in that shape. No `pattern`s (see the README). */
  schema?: object
  maxTokens?: number
}

export type FeaturePrint = FeaturePrintResult & { vector: Float32Array }

interface Pending {
  resolve(result: unknown): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout>
}

/** One running helper process and the calls sent to it. */
interface Running {
  child: ChildProcessWithoutNullStreams
  pending: Map<number, Pending>
  stderrTail: string[]
  ended: boolean
  stopping: boolean
}

const STOP_GRACE_MS = 2_000
const STDERR_TAIL_LINES = 20

/**
 * The Swift helper (`designstash-helper`) as a child of the main process, like `LlamaServer`: it
 * starts on the first call, stops after `idleMs` without one, and the next call after a crash
 * starts a fresh one. Calls are queued and sent one at a time, each with its own timeout; a hung
 * helper is killed. Every reply is checked against its zod schema.
 */
export class NativeHelper {
  private running_: Running | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private queued = 0
  private nextId = 1
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly config: NativeHelperConfig,
    private readonly deps: NativeHelperDeps = defaultNativeHelperDeps
  ) {}

  get running(): boolean {
    return this.running_ !== null
  }

  /** The OS, Vision request revisions and whether Apple's on-device model can take images. */
  info(): Promise<HelperInfo> {
    return this.call('info', {}, HelperInfoSchema)
  }

  /** Printed text on an image, one entry per line, boxes origin top-left. */
  ocr(path: string, options: OcrOptions = {}): Promise<OcrResult> {
    return this.call('ocr', { path, ...options }, OcrResultSchema)
  }

  /** People and hands above `minConfidence` (default 0.3), with boxes. */
  people(path: string, options: { minConfidence?: number } = {}): Promise<PeopleResult> {
    return this.call('people', { path, ...options }, PeopleResultSchema)
  }

  /** Vision's feature print, decoded. Compare prints only within one `revision`. */
  async featurePrint(path: string): Promise<FeaturePrint> {
    const result = await this.call('featureprint', { path }, FeaturePrintResultSchema)
    return { ...result, vector: decodeFloat32(result.data) }
  }

  /** The best labels from Vision's fixed taxonomy. */
  classify(
    path: string,
    options: { max?: number; minConfidence?: number } = {}
  ): Promise<ClassifyResult> {
    return this.call('classify', { path, ...options }, ClassifyResultSchema)
  }

  /** One greedy answer from Apple's on-device model, shaped by `schema` when given. */
  describe(request: DescribeRequest): Promise<DescribeResult> {
    const { imagePath, ...rest } = request
    return this.call(
      'describe',
      { path: imagePath, ...rest },
      DescribeResultSchema,
      this.config.describeTimeoutMs ?? 120_000
    )
  }

  /** Close the helper's stdin and stop it: SIGTERM, then SIGKILL if it hasn't gone. */
  async stop(): Promise<void> {
    this.clearIdle()
    const running = this.running_
    this.running_ = null
    if (!running || running.ended) return
    running.stopping = true
    const closed = new Promise<boolean>((resolve) =>
      running.child.once('close', () => resolve(true))
    )
    running.child.stdin.end()
    running.child.kill('SIGTERM')
    let timer: ReturnType<typeof setTimeout> | undefined
    const gone = await Promise.race([
      closed,
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), STOP_GRACE_MS)
      })
    ])
    clearTimeout(timer)
    if (!gone) running.child.kill('SIGKILL')
  }

  private call<T>(
    cmd: string,
    args: object,
    schema: z.ZodType<T>,
    timeoutMs = this.config.timeoutMs ?? 60_000
  ): Promise<T> {
    this.clearIdle()
    this.queued++
    const run = async (): Promise<T> => {
      const result = await this.send(cmd, args, timeoutMs)
      const parsed = schema.safeParse(result)
      if (!parsed.success) {
        throw new HelperError(
          'bad_reply',
          `${cmd} reply is not the expected shape: ${parsed.error.message}`
        )
      }
      return parsed.data
    }
    const answer = this.queue.then(run, run)
    const settle = () => {
      this.queued--
      if (this.queued === 0) this.armIdle()
    }
    this.queue = answer.then(settle, settle)
    return answer
  }

  private send(cmd: string, args: object, timeoutMs: number): Promise<unknown> {
    const running = this.ensureStarted()
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!running.pending.delete(id)) return
        reject(new HelperError('timeout', `${cmd} got no reply within ${timeoutMs} ms`))
        this.kill(running)
      }, timeoutMs)
      running.pending.set(id, { resolve, reject, timer })
      running.child.stdin.write(`${JSON.stringify({ id, cmd, args })}\n`)
    })
  }

  private ensureStarted(): Running {
    if (this.running_) return this.running_
    const binaryPath = this.config.binaryPath
    if (!binaryPath) {
      throw new HelperError(
        'unavailable',
        'designstash-helper is not installed (pnpm helper:build)'
      )
    }
    let child: ChildProcessWithoutNullStreams
    try {
      child = this.deps.spawn(binaryPath, [...(this.config.args ?? [])])
    } catch (err) {
      throw new HelperError('unavailable', `can't start ${binaryPath}: ${(err as Error).message}`)
    }
    const running: Running = {
      child,
      pending: new Map(),
      stderrTail: [],
      ended: false,
      stopping: false
    }
    this.running_ = running
    const unregister = this.deps.onParentExit(() => child.kill('SIGKILL'))

    const end = (failure: HelperError) => {
      if (running.ended) return
      running.ended = true
      unregister()
      if (this.running_ === running) {
        this.running_ = null
        this.clearIdle()
      }
      for (const entry of running.pending.values()) {
        clearTimeout(entry.timer)
        entry.reject(failure)
      }
      running.pending.clear()
    }

    // A write after the helper died fails here; the close handler reports it.
    child.stdin.on('error', () => {})
    createInterface({ input: child.stdout }).on('line', (line) => this.receive(running, line))
    child.stderr.on('data', (chunk: Buffer | string) => {
      running.stderrTail.push(...String(chunk).split('\n').filter(Boolean))
      if (running.stderrTail.length > STDERR_TAIL_LINES) {
        running.stderrTail = running.stderrTail.slice(-STDERR_TAIL_LINES)
      }
    })
    child.once('error', (err) =>
      end(new HelperError('unavailable', `can't run ${binaryPath}: ${err.message}`))
    )
    // 'close' comes after stdout and stderr have ended, so the last reply and log lines are in.
    child.once('close', (code, signal) => {
      if (running.stopping) return end(new HelperError('stopped', 'designstash-helper was stopped'))
      const how = signal ? `signal ${signal}` : `code ${code}`
      const tail = running.stderrTail.slice(-5).join(' | ')
      end(
        new HelperError('crashed', `designstash-helper exited (${how})${tail ? `. ${tail}` : ''}`)
      )
    })
    return running
  }

  private receive(running: Running, line: string): void {
    let json: unknown
    try {
      json = JSON.parse(line)
    } catch {
      return
    }
    const reply = HelperReplySchema.safeParse(json)
    if (!reply.success || typeof reply.data.id !== 'number') return
    const entry = running.pending.get(reply.data.id)
    if (!entry) return
    running.pending.delete(reply.data.id)
    clearTimeout(entry.timer)
    if (reply.data.ok) entry.resolve(reply.data.result)
    else {
      const { code = 'bad_reply', message = 'error reply without a message' } =
        reply.data.error ?? {}
      entry.reject(new HelperError(code, message))
    }
  }

  /** Stops a hung helper at once. The next call starts a fresh one. */
  private kill(running: Running): void {
    if (this.running_ === running) this.running_ = null
    running.child.kill('SIGKILL')
  }

  private armIdle(): void {
    if (!this.running_) return
    this.idleTimer = setTimeout(() => void this.stop(), this.config.idleMs ?? 5 * 60_000)
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
  }
}

/** Base64 little-endian Float32 as a Float32Array (copied, so the buffer is aligned). */
export function decodeFloat32(base64: string): Float32Array {
  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'))
  return new Float32Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 4))
}
