import { spawn as nodeSpawn } from 'node:child_process'
import { createServer } from 'node:net'
import { basename, dirname } from 'node:path'
import { logger } from '../logger'

/** The parts of a child process the server uses, so tests can hand in a fake. */
export interface ServerProcess {
  readonly pid?: number | undefined
  readonly exitCode: number | null
  kill(signal?: NodeJS.Signals): boolean
  once(event: 'exit', listener: (code: number | null) => void): unknown
  /** A spawn that fails (no file, no execute bit) emits this and never 'exit'. */
  on(event: 'error', listener: (err: Error) => void): unknown
  stderr?: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown } | null
}

export interface LlamaServerConfig {
  binaryPath: string
  modelPath: string
  /** The image projector of a vision model. Not set for an embedding model. */
  mmprojPath?: string
  /** Run as an embedding server (`--embedding`): no chat, no image projector; `embed` is its call. */
  embedding?: boolean
  /** Stop the server after this long without a request. Default 5 minutes. */
  idleMs?: number
  /** How long the model may take to load. Default 2 minutes. */
  startTimeoutMs?: number
  /** How long one request may take. Default 3 minutes. */
  requestTimeoutMs?: number
  /** Context window in tokens: room for one cover and the reply. Default 8192. */
  ctxSize?: number
  /** Flags a model needs on top of the defaults, like a chat template override. */
  extraArgs?: readonly string[]
  /** Told the pid when the server starts and when it ends, so a crashed app can't leave it behind. */
  tracker?: { record(pid: number): void | Promise<void>; clear(): void | Promise<void> }
}

export interface LlamaServerDeps {
  spawn(command: string, args: string[]): ServerProcess
  freePort(): Promise<number>
  fetch: typeof fetch
  sleep(ms: number): Promise<void>
  /** Kill the child if the app quits under it. Returns a function that unregisters. */
  onParentExit(listener: () => void): () => void
  /** Where each start, stop and exit is written down, so a problem report shows every restart. */
  log?(line: string): void
}

/** The parts of an OpenAI-compatible chat completion reply that llama-server fills in. */
export interface ChatCompletion {
  choices?: { message?: { content?: unknown }; logprobs?: unknown }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  timings?: Record<string, number>
}

/**
 * A start of llama-server that failed: it couldn't be spawned, exited while loading, or never became
 * ready. The runtime's trouble, never the request's: the queue counts these to tell that the
 * runtime itself is broken (F-038).
 */
export class LlamaStartError extends Error {
  override name = 'LlamaStartError'
}

const HOST = '127.0.0.1'
const HEALTH_POLL_MS = 250
const STOP_GRACE_MS = 5_000
const STDERR_TAIL_LINES = 20
const IDLE_MS = 5 * 60_000

/** A free TCP port on 127.0.0.1, found by binding port 0 and letting it go. */
export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, HOST, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => (port ? resolve(port) : reject(new Error('No free port'))))
    })
  })
}

export const defaultLlamaServerDeps: LlamaServerDeps = {
  spawn: (command, args) => nodeSpawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] }),
  freePort: findFreePort,
  fetch: (...args) => globalThis.fetch(...args),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onParentExit: (listener) => {
    process.once('exit', listener)
    return () => process.off('exit', listener)
  },
  log: (line) => logger.info(line)
}

/**
 * One llama.cpp `llama-server` for one vision model (GGUF + mmproj), run as a child of the
 * main process on 127.0.0.1. It starts on the first request, waits for /health, and stops
 * after `idleMs` without requests; the next request starts it again. Talks to the
 * OpenAI-compatible /v1/chat/completions endpoint.
 */
export class LlamaServer {
  private child: ServerProcess | null = null
  private starting: Promise<string> | null = null
  /** The model is loaded and answering: /health said so, and the server hasn't stopped since. */
  private healthy = false
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private inFlight = 0
  private stderrTail: string[] = []

  constructor(
    private readonly config: LlamaServerConfig,
    private readonly deps: LlamaServerDeps = defaultLlamaServerDeps
  ) {}

  get running(): boolean {
    return this.child !== null
  }

  /** Whether the model is loaded and answering now. False while the server is down or still loading. */
  get ready(): boolean {
    return this.healthy
  }

  /** Start the server and wait for the model to load, without a request. At once when it is ready. */
  async start(): Promise<void> {
    this.clearIdle()
    this.inFlight++
    try {
      await this.ensureStarted()
    } finally {
      this.inFlight--
      if (this.inFlight === 0) this.armIdle()
    }
  }

  /** POST a chat completion and return the reply text. Starts the server if it isn't running. */
  async chat(body: object): Promise<string> {
    const json = await this.complete(body)
    const content = json.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new Error('llama-server reply has no message content')
    return content
  }

  /**
   * POST a chat completion and return the whole reply (every choice, logprobs, usage, timings).
   * Aborting `signal` cancels it, which frees the server's one slot for the next request (F-035).
   */
  async complete(body: object, signal?: AbortSignal): Promise<ChatCompletion> {
    return (await this.post('/v1/chat/completions', body, signal)) as ChatCompletion
  }

  /** Vectors for texts, in order, from an embedding server. Starts the server if it isn't running. */
  async embed(texts: readonly string[]): Promise<number[][]> {
    const json = (await this.post('/v1/embeddings', { input: texts })) as {
      data?: { index?: number; embedding?: unknown }[]
    }
    const rows = [...(json.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    if (rows.length !== texts.length || rows.some((r) => !Array.isArray(r.embedding))) {
      throw new Error('llama-server reply has no embeddings')
    }
    return rows.map((r) => r.embedding as number[])
  }

  private async post(path: string, body: object, signal?: AbortSignal): Promise<unknown> {
    this.clearIdle()
    this.inFlight++
    try {
      const baseUrl = await this.ensureStarted()
      const res = await this.deps.fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: this.requestSignal(signal)
      })
      if (!res.ok) {
        throw new Error(`llama-server answered ${res.status}: ${(await res.text()).slice(0, 200)}`)
      }
      return await res.json()
    } finally {
      this.inFlight--
      if (this.inFlight === 0) this.armIdle()
    }
  }

  /** The request's own time limit, and the caller's signal when there is one. */
  private requestSignal(signal?: AbortSignal): AbortSignal {
    const timeout = AbortSignal.timeout(this.config.requestTimeoutMs ?? 180_000)
    return signal ? AbortSignal.any([signal, timeout]) : timeout
  }

  /** Stop the child: SIGTERM, then SIGKILL if it hasn't gone after a grace period. */
  async stop(why: 'asked' | 'idle' = 'asked'): Promise<void> {
    this.clearIdle()
    const child = this.child
    this.child = null
    this.starting = null
    this.healthy = false
    if (!child || child.exitCode !== null) return
    this.deps.log?.(`[AI] llama-server for ${this.name} stopped${why === 'idle' ? ` after ${Math.round((this.config.idleMs ?? IDLE_MS) / 60_000)} min idle` : ''}.`)

    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
    child.kill('SIGTERM')
    const gone = await Promise.race([
      exited.then(() => true),
      this.deps.sleep(STOP_GRACE_MS).then(() => false)
    ])
    if (!gone) child.kill('SIGKILL')
  }

  /** The model's folder, which names it in the log without a path ("qwen3.5-9b"). */
  private get name(): string {
    return basename(dirname(this.config.modelPath))
  }

  private ensureStarted(): Promise<string> {
    if (!this.starting) {
      this.starting = this.launch().catch((err) => {
        this.starting = null
        this.deps.log?.(`[AI] llama-server for ${this.name} couldn't start: ${err instanceof Error ? err.message : String(err)}`)
        throw err
      })
    }
    return this.starting
  }

  private async launch(): Promise<string> {
    const { binaryPath, modelPath, mmprojPath, embedding = false, ctxSize = 8192 } = this.config
    const port = await this.deps.freePort()
    const baseUrl = `http://${HOST}:${port}`
    const args = [
      '--model',
      modelPath,
      ...(mmprojPath ? ['--mmproj', mmprojPath] : []),
      ...(embedding ? ['--embedding'] : []),
      '--host',
      HOST,
      '--port',
      String(port),
      '--ctx-size',
      String(ctxSize),
      '--parallel',
      '1',
      '--no-webui',
      ...(this.config.extraArgs ?? [])
    ]

    this.stderrTail = []
    const startedAt = performance.now()
    const child = this.deps.spawn(binaryPath, args)
    this.child = child
    let exitCode: number | null | undefined
    if (child.pid !== undefined) void this.config.tracker?.record(child.pid)
    const unregister = this.deps.onParentExit(() => child.kill('SIGKILL'))
    child.stderr?.on('data', (chunk) => this.recordStderr(String(chunk)))
    let failed: Error | undefined
    child.on('error', (err) => {
      failed ??= err
      this.recordStderr(`process error: ${err.message}`)
      // Never spawned: there is no process to exit, so forget it here.
      if (child.pid === undefined && this.child === child) {
        unregister()
        this.child = null
        this.healthy = false
        this.clearIdle()
      }
    })
    child.once('exit', (code) => {
      exitCode = code
      unregister()
      void this.config.tracker?.clear()
      // Crashed or stopped: the next request starts a fresh one.
      if (this.child === child) {
        if (this.healthy) this.deps.log?.(`[AI] llama-server for ${this.name} exited on its own (code ${code}). The next request starts it again.`)
        this.child = null
        this.starting = null
        this.healthy = false
        this.clearIdle()
      }
    })

    const polls = Math.ceil((this.config.startTimeoutMs ?? 120_000) / HEALTH_POLL_MS)
    for (let i = 0; i < polls; i++) {
      if (failed) {
        if (child.pid !== undefined) await this.stop()
        throw new LlamaStartError(`llama-server couldn't start: ${failed.message}. ${this.tail()}`)
      }
      if (exitCode !== undefined) {
        throw new LlamaStartError(`llama-server exited while loading (code ${exitCode}). ${this.tail()}`)
      }
      try {
        // 503 while the model loads, 200 once it's ready.
        const res = await this.deps.fetch(`${baseUrl}/health`)
        if (res.ok) {
          this.healthy = this.child === child
          this.deps.log?.(`[AI] llama-server for ${this.name} is up after ${((performance.now() - startedAt) / 1000).toFixed(1)} s.`)
          return baseUrl
        }
      } catch {
        // Not listening yet.
      }
      await this.deps.sleep(HEALTH_POLL_MS)
    }
    await this.stop()
    throw new LlamaStartError(`llama-server didn't become ready in time. ${this.tail()}`)
  }

  private armIdle(): void {
    if (!this.child) return
    this.idleTimer = setTimeout(() => void this.stop('idle'), this.config.idleMs ?? IDLE_MS)
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
  }

  private recordStderr(text: string): void {
    this.stderrTail.push(...text.split('\n').filter(Boolean))
    if (this.stderrTail.length > STDERR_TAIL_LINES) {
      this.stderrTail = this.stderrTail.slice(-STDERR_TAIL_LINES)
    }
  }

  private tail(): string {
    return this.stderrTail.slice(-5).join(' | ')
  }
}
