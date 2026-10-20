import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { LlamaServer, type LlamaServerDeps, type ServerProcess } from './llama-server'

/** A child process that does nothing until the test makes it exit. */
class FakeProcess extends EventEmitter implements ServerProcess {
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
    chat?: () => Response | Promise<Response>
    exitsOnTerm?: boolean
    idleMs?: number
    startTimeoutMs?: number
    extraArgs?: string[]
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
      return opts.chat ? opts.chat() : reply('{"title":"t"}')
    }) as unknown as typeof fetch,
    sleep: async () => {},
    onParentExit: (listener) => {
      parentExit.listeners.add(listener)
      return () => parentExit.listeners.delete(listener)
    }
  }

  const server = new LlamaServer(
    {
      binaryPath: '/bin/llama-server',
      modelPath: '/models/m/model.gguf',
      mmprojPath: '/models/m/mmproj.gguf',
      idleMs: opts.idleMs ?? 1000,
      ...(opts.startTimeoutMs !== undefined && { startTimeoutMs: opts.startTimeoutMs }),
      ...(opts.extraArgs && { extraArgs: opts.extraArgs })
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

  it('stop() with nothing running does nothing', async () => {
    const h = harness()
    await expect(h.server.stop()).resolves.toBeUndefined()
    expect(h.spawnArgs).toHaveLength(0)
  })
})
