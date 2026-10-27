import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { LlamaServer, LlamaStartError, type LlamaServerDeps, type ServerProcess } from './llama-server'

/** A child process that does nothing until the test makes it exit. */
class FakeProcess extends EventEmitter implements ServerProcess {
  pid: number | undefined = 777
  exitCode: number | null = null
  readonly signals: string[] = []
  readonly stderr = new EventEmitter()
  /** When false, SIGTERM is ignored (a hung server). */
  constructor(private readonly exitsOnTerm = true) {
    super()
  }
  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.signals.push(signal)
    if (signal === 'SIGKILL' || this.exitsOnTerm) this.exit(null)
    return true
  }
  exit(code: number | null): void {
    if (this.exitCode !== null) return
    this.exitCode = code ?? 0
    this.emit('exit', code)
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const reply = (content: string) => json({ choices: [{ message: { content } }] })

interface Harness {
  server: LlamaServer
  deps: LlamaServerDeps
  processes: FakeProcess[]
  spawnArgs: string[][]
  chatBodies: unknown[]
  parentExit: { listeners: Set<() => void> }
}

function harness(
  opts: {
    health?: () => Response | Promise<Response>
    chat?: (init?: RequestInit) => Response | Promise<Response>
    exitsOnTerm?: boolean
    idleMs?: number
    startTimeoutMs?: number
    extraArgs?: string[]
    tracker?: { record: (pid: number) => void; clear: () => void }
    log?: (line: string) => void
  } = {}
): Harness {
  const processes: FakeProcess[] = []
  const spawnArgs: string[][] = []
  const chatBodies: unknown[] = []
  const parentExit = { listeners: new Set<() => void>() }
  let port = 40000

  const deps: LlamaServerDeps = {
    spawn: (command, args) => {
      spawnArgs.push([command, ...args])
      const p = new FakeProcess(opts.exitsOnTerm ?? true)
      processes.push(p)
      return p
    },
    freePort: async () => ++port,
    fetch: vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/health')) return opts.health ? opts.health() : json({ status: 'ok' })
      chatBodies.push(JSON.parse(String(init?.body)))
      return opts.chat ? opts.chat(init) : reply('{"title":"t"}')
    }) as unknown as typeof fetch,
    sleep: async () => {},
    onParentExit: (listener) => {
      parentExit.listeners.add(listener)
      return () => parentExit.listeners.delete(listener)
    },
    ...(opts.log && { log: opts.log })
  }

  const server = new LlamaServer(
    {
      binaryPath: '/bin/llama-server',
      modelPath: '/models/m/model.gguf',
      mmprojPath: '/models/m/mmproj.gguf',
      idleMs: opts.idleMs ?? 1000,
      ...(opts.startTimeoutMs !== undefined && { startTimeoutMs: opts.startTimeoutMs }),
      ...(opts.extraArgs && { extraArgs: opts.extraArgs }),
      ...(opts.tracker && { tracker: opts.tracker })
    },
    deps
  )
  return { server, deps, processes, spawnArgs, chatBodies, parentExit }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('LlamaServer', () => {
  it('starts llama-server with the model, its mmproj and a local port on the first request', async () => {
    const h = harness()
    await expect(h.server.chat({ messages: [] })).resolves.toBe('{"title":"t"}')

    expect(h.spawnArgs).toHaveLength(1)
    const [command, ...args] = h.spawnArgs[0]!
    expect(command).toBe('/bin/llama-server')
    const flag = (name: string) => args[args.indexOf(name) + 1]
    expect(flag('--model')).toBe('/models/m/model.gguf')
    expect(flag('--mmproj')).toBe('/models/m/mmproj.gguf')
    expect(flag('--host')).toBe('127.0.0.1')
    expect(flag('--port')).toBe('40001')
    expect(args).toContain('--no-webui')
  })

  it("adds the model's own flags after the defaults", async () => {
    const h = harness({ extraArgs: ['--no-jinja', '--chat-template', 'vicuna'] })
    await h.server.chat({})
    expect(h.spawnArgs[0]!.slice(-3)).toEqual(['--no-jinja', '--chat-template', 'vicuna'])
  })

  it('posts to the OpenAI-compatible chat endpoint on that port', async () => {
    const h = harness()
    await h.server.chat({ messages: [{ role: 'user', content: 'hi' }] })
    const calls = (h.deps.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    const chatCall = calls.find(([url]) => String(url).endsWith('/v1/chat/completions'))!
    expect(String(chatCall[0])).toBe('http://127.0.0.1:40001/v1/chat/completions')
    expect(h.chatBodies[0]).toEqual({ messages: [{ role: 'user', content: 'hi' }] })
  })

  it('waits while /health says the model is loading', async () => {
    let polls = 0
    const h = harness({
      health: () => (++polls < 4 ? json({ error: 'Loading model' }, 503) : json({ status: 'ok' }))
    })
    await h.server.chat({})
    expect(polls).toBe(4)
    expect(h.chatBodies).toHaveLength(1)
  })

  it('keeps polling while the port is not listening yet', async () => {
    let polls = 0
    const h = harness({
      health: () => {
        if (++polls < 3) throw new TypeError('fetch failed')
        return json({ status: 'ok' })
      }
    })
    await h.server.chat({})
    expect(polls).toBe(3)
  })

  it('loads the model on start() without a request, and says when it answers', async () => {
    vi.useFakeTimers()
    let loaded!: () => void
    const loading = new Promise<void>((resolve) => (loaded = resolve))
    const h = harness({ idleMs: 1000, health: async () => (await loading, json({ status: 'ok' })) })
    expect(h.server.ready).toBe(false)
    const starting = h.server.start()
    await vi.advanceTimersByTimeAsync(0)
    expect([h.server.running, h.server.ready]).toEqual([true, false])
    loaded()
    await starting
    expect(h.server.ready).toBe(true)
    await h.server.chat({})
    expect(h.spawnArgs).toHaveLength(1)

    // Unused after start, it stops after the idle time like any other.
    await vi.advanceTimersByTimeAsync(1000)
    expect([h.server.running, h.server.ready]).toEqual([false, false])
    await h.server.start()
    h.processes[1]!.exit(139)
    expect(h.server.ready).toBe(false)
  })

  it('runs one server for many requests, including ones made while it starts', async () => {
    const h = harness()
    await Promise.all([h.server.chat({}), h.server.chat({}), h.server.chat({})])
    await h.server.chat({})
    expect(h.spawnArgs).toHaveLength(1)
    expect(h.chatBodies).toHaveLength(4)
  })

  it('fails with the end of its log when the server exits while loading, and starts afresh next time', async () => {
    let first = true
    const h = harness({
      health: () => {
        if (!first) return json({ status: 'ok' })
        first = false
        const p = h.processes[0]!
        p.stderr.emit('data', 'llama_model_load: error loading model\n')
        p.exit(1)
        return json({ error: 'Loading model' }, 503)
      }
    })
    await expect(h.server.chat({})).rejects.toThrow(
      /exited while loading \(code 1\).*error loading model/
    )
    expect(h.server.running).toBe(false)

    await expect(h.server.chat({})).resolves.toBe('{"title":"t"}')
    expect(h.spawnArgs).toHaveLength(2)
  })

  it("fails at once, with the reason, when the binary can't be started, and starts afresh next time (F-039)", async () => {
    // A spawn that fails (no file, no execute bit) emits 'error' and never 'exit', and nothing listens on the port.
    const h = harness({
      health: () => {
        if (h.processes.at(-1)!.pid === undefined) throw new TypeError('fetch failed')
        return json({ status: 'ok' })
      }
    })
    const spawn = h.deps.spawn
    let broken = true
    h.deps.spawn = (command, args) => {
      const p = spawn(command, args) as FakeProcess
      if (broken) {
        broken = false
        p.pid = undefined
        process.nextTick(() => p.emit('error', Object.assign(new Error('spawn /bin/llama-server ENOENT'), { code: 'ENOENT' })))
      }
      return p
    }
    h.deps.sleep = () => new Promise((resolve) => setTimeout(resolve, 0))

    await expect(h.server.chat({})).rejects.toThrow(/couldn't start.*ENOENT/)
    const healthChecks = vi.mocked(h.deps.fetch).mock.calls.filter(([url]) => String(url).endsWith('/health'))
    expect(healthChecks.length).toBeLessThanOrEqual(2)
    expect(h.server.running).toBe(false)

    await expect(h.server.chat({})).resolves.toBe('{"title":"t"}')
    expect(h.spawnArgs).toHaveLength(2)
  })

  it('logs each start, a start that fails, a stop, and an exit on its own, so a problem report shows every restart (F-075)', async () => {
    const lines: string[] = []
    let failFirst = true
    const h = harness({
      log: (line) => lines.push(line),
      health: () => {
        if (!failFirst) return json({ status: 'ok' })
        failFirst = false
        h.processes[0]!.exit(1)
        return json({ error: 'Loading model' }, 503)
      }
    })

    await expect(h.server.chat({})).rejects.toThrow(/exited while loading/)
    await h.server.chat({})
    h.processes[1]!.exit(139)
    await h.server.chat({})
    await h.server.stop()

    expect(lines).toEqual([
      expect.stringMatching(/^\[AI\] llama-server for m couldn't start: llama-server exited while loading \(code 1\)/),
      expect.stringMatching(/^\[AI\] llama-server for m is up after \d+\.\d s\.$/),
      '[AI] llama-server for m exited on its own (code 139). The next request starts it again.',
      expect.stringMatching(/^\[AI\] llama-server for m is up after \d+\.\d s\.$/),
      '[AI] llama-server for m stopped.'
    ])
  })

  it("marks a start that fails as the runtime's (LlamaStartError), and a failed request as not (F-038)", async () => {
    const exits = harness({
      health: () => {
        exits.processes[0]!.exit(1)
        return json({ error: 'Loading model' }, 503)
      }
    })
    await expect(exits.server.chat({})).rejects.toBeInstanceOf(LlamaStartError)
    const never = harness({ health: () => json({ error: 'Loading model' }, 503), startTimeoutMs: 1000 })
    await expect(never.server.chat({})).rejects.toBeInstanceOf(LlamaStartError)
    const answers500 = harness({ chat: () => json({ error: 'boom' }, 500) })
    const err = await answers500.server.chat({}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(LlamaStartError)
  })

  it('gives up and kills the server when it never becomes ready', async () => {
    const h = harness({ health: () => json({ error: 'Loading model' }, 503), startTimeoutMs: 1000 })
    await expect(h.server.chat({})).rejects.toThrow(/didn't become ready/)
    expect(h.processes[0]!.signals).toEqual(['SIGTERM'])
    expect(h.server.running).toBe(false)
  })

  it('reports a failed request with its status', async () => {
    const h = harness({ chat: () => new Response('bad image', { status: 400 }) })
    await expect(h.server.chat({})).rejects.toThrow('llama-server answered 400: bad image')
  })

  it('complete() gives back the whole reply: every choice, logprobs, usage and timings', async () => {
    const body = {
      choices: [
        { message: { content: 'a' }, logprobs: { content: [{ token: 'a', logprob: -0.2 }] } },
        { message: { content: 'b' } }
      ],
      usage: { prompt_tokens: 900, completion_tokens: 12 },
      timings: { prompt_ms: 310.5 }
    }
    const h = harness({ chat: () => json(body) })
    await expect(h.server.complete({ n: 2, logprobs: true })).resolves.toEqual(body)
    expect(h.chatBodies[0]).toEqual({ n: 2, logprobs: true })
  })

  it('complete() reports a failed request with its status', async () => {
    const h = harness({ chat: () => new Response('bad image', { status: 400 }) })
    await expect(h.server.complete({})).rejects.toThrow('llama-server answered 400: bad image')
  })

  it('reports a reply with no message content', async () => {
    const h = harness({ chat: () => json({ choices: [] }) })
    await expect(h.server.chat({})).rejects.toThrow('no message content')
  })

  it('stops after the idle time and starts again on the next request', async () => {
    vi.useFakeTimers()
    const h = harness({ idleMs: 1000 })
    await h.server.chat({})
    expect(h.server.running).toBe(true)

    await vi.advanceTimersByTimeAsync(999)
    expect(h.server.running).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(h.server.running).toBe(false)
    expect(h.processes[0]!.signals).toEqual(['SIGTERM'])

    await h.server.chat({})
    expect(h.spawnArgs).toHaveLength(2)
  })

  it('each request restarts the idle clock', async () => {
    vi.useFakeTimers()
    const h = harness({ idleMs: 1000 })
    await h.server.chat({})
    await vi.advanceTimersByTimeAsync(800)
    await h.server.chat({})
    await vi.advanceTimersByTimeAsync(800)
    expect(h.server.running).toBe(true)
    await vi.advanceTimersByTimeAsync(200)
    expect(h.server.running).toBe(false)
  })

  it('starts a new server after the old one crashes', async () => {
    const h = harness()
    await h.server.chat({})
    h.processes[0]!.exit(139)
    expect(h.server.running).toBe(false)
    await h.server.chat({})
    expect(h.spawnArgs).toHaveLength(2)
  })

  it('stop() sends SIGTERM, then SIGKILL when the server ignores it', async () => {
    const h = harness({ exitsOnTerm: false })
    await h.server.chat({})
    await h.server.stop()
    expect(h.processes[0]!.signals).toEqual(['SIGTERM', 'SIGKILL'])
    expect(h.server.running).toBe(false)
  })

  it('kills the server if the app quits, and forgets the hook once it has exited', async () => {
    const h = harness()
    await h.server.chat({})
    expect(h.parentExit.listeners.size).toBe(1)
    for (const listener of h.parentExit.listeners) listener()
    expect(h.processes[0]!.signals).toEqual(['SIGKILL'])
    expect(h.parentExit.listeners.size).toBe(0)
  })

  it('tells the tracker the pid when it starts and clears it when it ends, whether it stops or crashes', async () => {
    const tracker = { record: vi.fn(), clear: vi.fn() }
    const { server, processes } = harness({ tracker })

    await server.chat({ messages: [] })
    expect(tracker.record).toHaveBeenCalledWith(777)
    expect(tracker.clear).not.toHaveBeenCalled()

    await server.stop()
    expect(tracker.clear).toHaveBeenCalledTimes(1)

    await server.chat({ messages: [] })
    processes[1]!.exit(1) // a crash
    expect(tracker.record).toHaveBeenCalledTimes(2)
    expect(tracker.clear).toHaveBeenCalledTimes(2)
  })

  it('stop() with nothing running does nothing', async () => {
    const h = harness()
    await expect(h.server.stop()).resolves.toBeUndefined()
    expect(h.spawnArgs).toHaveLength(0)
  })
})

describe('LlamaServer as an embedding server', () => {
  const embedReply = (vectors: number[][]) =>
    json({ data: vectors.map((embedding, index) => ({ index, embedding })) })

  it('starts with --embedding and no --mmproj, and returns the vectors in input order', async () => {
    const h = harness({
      chat: () => embedReply([[0, 1], [1, 0]])
    })
    const server = new LlamaServer(
      { binaryPath: '/bin/llama-server', modelPath: '/m/nomic.gguf', embedding: true, ctxSize: 2048 },
      h.deps
    )
    expect(await server.embed(['a', 'b'])).toEqual([[0, 1], [1, 0]])
    const args = h.spawnArgs[0]!
    expect(args).toContain('--embedding')
    expect(args).not.toContain('--mmproj')
    expect(args[args.indexOf('--ctx-size') + 1]).toBe('2048')
    expect(h.chatBodies[0]).toEqual({ input: ['a', 'b'] })
    await server.stop()
  })

  it('throws when the reply has fewer vectors than texts', async () => {
    const h = harness({ chat: () => embedReply([[1, 0]]) })
    const server = new LlamaServer(
      { binaryPath: '/bin/llama-server', modelPath: '/m/nomic.gguf', embedding: true },
      h.deps
    )
    await expect(server.embed(['a', 'b'])).rejects.toThrow(/no embeddings/)
    await server.stop()
  })
})
