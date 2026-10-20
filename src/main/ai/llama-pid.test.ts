import { describe, it, expect, vi } from 'vitest'
import { LlamaPidFile, type LlamaPidDeps } from './llama-pid'

function setup(initial: string | null, command: string | null = '/path/to/llama-server') {
  const files = new Map<string, string>()
  if (initial !== null) files.set('/ud/llama-server.pid', initial)
  const kill = vi.fn<LlamaPidDeps['kill']>()
  const pidFile = new LlamaPidFile('/ud/llama-server.pid', {
    readFile: async (p) => {
      const text = files.get(p)
      if (text === undefined) throw new Error('ENOENT')
      return text
    },
    writeFile: async (p, text) => void files.set(p, text),
    rm: async (p) => void files.delete(p),
    commandOf: async () => command,
    kill
  })
  return { pidFile, files, kill }
}

describe('LlamaPidFile', () => {
  it('remembers the pid and forgets it', async () => {
    const { pidFile, files } = setup(null)
    await pidFile.record(4242)
    expect(files.get('/ud/llama-server.pid')).toBe('4242')
    await pidFile.clear()
    expect(files.size).toBe(0)
  })

  it('stops a llama-server left behind by a crashed run, and clears the file', async () => {
    const { pidFile, files, kill } = setup('4242')
    expect(await pidFile.reapStale()).toBe(true)
    expect(kill).toHaveBeenCalledWith(4242, 'SIGKILL')
    expect(files.size).toBe(0)
  })

  it('leaves a pid alone when the program there is no longer llama-server', async () => {
    const { pidFile, files, kill } = setup('4242', '/usr/bin/vim')
    expect(await pidFile.reapStale()).toBe(false)
    expect(kill).not.toHaveBeenCalled()
    expect(files.size).toBe(0)
  })

  it('does nothing when that process has already gone', async () => {
    const { pidFile, kill } = setup('4242', null)
    expect(await pidFile.reapStale()).toBe(false)
    expect(kill).not.toHaveBeenCalled()
  })

  it('does nothing when there is no file', async () => {
    const { pidFile, kill } = setup(null)
    expect(await pidFile.reapStale()).toBe(false)
    expect(kill).not.toHaveBeenCalled()
  })

  it.each(['', 'abc', '0', '1', '-5', String(process.pid)])('never kills for the pid "%s"', async (text) => {
    const { pidFile, kill } = setup(text)
    expect(await pidFile.reapStale()).toBe(false)
    expect(kill).not.toHaveBeenCalled()
  })

  it('reports false when the kill is refused', async () => {
    const { pidFile, kill } = setup('4242')
    kill.mockImplementation(() => {
      throw new Error('EPERM')
    })
    expect(await pidFile.reapStale()).toBe(false)
  })
})
