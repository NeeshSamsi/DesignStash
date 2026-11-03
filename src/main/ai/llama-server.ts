import { spawn as nodeSpawn } from 'node:child_process'
import { createServer } from 'node:net'

/** The parts of a child process the server uses, so tests can hand in a fake. */
export interface ServerProcess {
  readonly pid?: number | undefined
  readonly exitCode: number | null
  kill(signal?: NodeJS.Signals): boolean
  once(event: 'exit', listener: (code: number | null) => void): unknown
  stderr?: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown } | null
}

export interface LlamaServerConfig {
  binaryPath: string
  modelPath: string
  mmprojPath: string
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
}

/** The parts of an OpenAI-compatible chat completion reply that llama-server fills in. */
export interface ChatCompletion {
  choices?: { message?: { content?: unknown }; logprobs?: unknown }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  timings?: Record<string, number>
}

const HOST = '127.0.0.1'
const HEALTH_POLL_MS = 250
const STOP_GRACE_MS = 5_000
const STDERR_TAIL_LINES = 20

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
  }
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

  /** POST a chat completion and return the reply text. Starts the server if it isn't running. */
  async chat(body: object): Promise<string> {
    const json = await this.complete(body)
    const content = json.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new Error('llama-server reply has no message content')
    return content
  }

  /** POST a chat completion and return the whole reply (every choice, logprobs, usage, timings). */
  async complete(body: object): Promise<ChatCompletion> {
    this.clearIdle()
    this.inFlight++
    try {
      const baseUrl = await this.ensureStarted()
      const res = await this.deps.fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs ?? 180_000)
      })
      if (!res.ok) {
        throw new Error(`llama-server answered ${res.status}: ${(await res.text()).slice(0, 200)}`)
      }
      return (await res.json()) as ChatCompletion
    } finally {
      this.inFlight--
      if (this.inFlight === 0) this.armIdle()
    }
  }

  /** Stop the child: SIGTERM, then SIGKILL if it hasn't gone after a grace period. */
  async stop(): Promise<void> {
    this.clearIdle()
    const child = this.child
    this.child = null
    this.starting = null
    if (!child || child.exitCode !== null) return

    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
    child.kill('SIGTERM')
    const gone = await Promise.race([
      exited.then(() => true),
      this.deps.sleep(STOP_GRACE_MS).then(() => false)
    ])
    if (!gone) child.kill('SIGKILL')
  }

  private ensureStarted(): Promise<string> {
    if (!this.starting) {
      this.starting = this.start().catch((err) => {
        this.starting = null
        throw err
      })
    }
    return this.starting
  }

  private async start(): Promise<string> {
    const { binaryPath, modelPath, mmprojPath, ctxSize = 8192 } = this.config
    const port = await this.deps.freePort()
    const baseUrl = `http://${HOST}:${port}`
    const args = [
      '--model',
      modelPath,
      '--mmproj',
      mmprojPath,
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
    const child = this.deps.spawn(binaryPath, args)
    this.child = child
    let exitCode: number | null | undefined
    if (child.pid !== undefined) void this.config.tracker?.record(child.pid)
    const unregister = this.deps.onParentExit(() => child.kill('SIGKILL'))
    child.stderr?.on('data', (chunk) => this.recordStderr(String(chunk)))
    child.once('exit', (code) => {
      exitCode = code
      unregister()
      void this.config.tracker?.clear()
      // Crashed or stopped: the next request starts a fresh one.
      if (this.child === child) {
        this.child = null
        this.starting = null
        this.clearIdle()
      }
    })

    const polls = Math.ceil((this.config.startTimeoutMs ?? 120_000) / HEALTH_POLL_MS)
    for (let i = 0; i < polls; i++) {
      if (exitCode !== undefined) {
        throw new Error(`llama-server exited while loading (code ${exitCode}). ${this.tail()}`)
      }
      try {
        // 503 while the model loads, 200 once it's ready.
        const res = await this.deps.fetch(`${baseUrl}/health`)
        if (res.ok) return baseUrl
      } catch {
        // Not listening yet.
      }
      await this.deps.sleep(HEALTH_POLL_MS)
    }
    await this.stop()
    throw new Error(`llama-server didn't become ready in time. ${this.tail()}`)
  }

  private armIdle(): void {
    if (!this.child) return
    this.idleTimer = setTimeout(() => void this.stop(), this.config.idleMs ?? 5 * 60_000)
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
