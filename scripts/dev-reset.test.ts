import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { devReset } from './dev-reset.mjs'

const dirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ds-dev-reset-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A userData folder whose settings point at `libraryRoot`, and a library with its files in it. */
function setup(libraryRoot?: (home: string) => string): { userData: string; stash: string } {
  const home = tempDir()
  const userData = join(home, 'Application Support', 'designstash')
  const stash = libraryRoot ? libraryRoot(home) : join(userData, 'Library')
  mkdirSync(userData, { recursive: true })
  mkdirSync(join(stash, 'mockups', 'abc'), { recursive: true })
  writeFileSync(join(stash, 'designstash.db'), 'db')
  writeFileSync(join(stash, 'mockups', 'abc', 'original.psd'), 'psd')
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ libraryRoot: stash }))
  return { userData, stash }
}

describe('dev-reset', () => {
  it('leaves a stash folder outside userData untouched', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { userData, stash } = setup((home) => join(home, 'Documents', 'DesignStash'))

    await devReset({ userData, all: false })

    expect(existsSync(userData)).toBe(false)
    expect(existsSync(join(stash, 'designstash.db'))).toBe(true)
    expect(existsSync(join(stash, 'mockups', 'abc', 'original.psd'))).toBe(true)
  })

  it('with --all, clears the library files there too and keeps the folder', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { userData, stash } = setup((home) => join(home, 'Documents', 'DesignStash'))
    writeFileSync(join(stash, 'notes.txt'), 'mine')

    await devReset({ userData, all: true })

    expect(existsSync(join(stash, 'designstash.db'))).toBe(false)
    expect(existsSync(join(stash, 'mockups'))).toBe(false)
    expect(existsSync(join(stash, 'notes.txt'))).toBe(true)
  })

  it('clears a stash folder inside userData with it', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { userData, stash } = setup()

    await devReset({ userData, all: false })

    expect(existsSync(stash)).toBe(false)
    expect(existsSync(userData)).toBe(false)
  })

  it('removes the AI models, which live in userData', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { userData } = setup((home) => join(home, 'Documents', 'DesignStash'))
    mkdirSync(join(userData, 'models', 'qwen3-vl-4b'), { recursive: true })
    writeFileSync(join(userData, 'models', 'qwen3-vl-4b', 'model.gguf'), 'weights')

    await devReset({ userData, all: false })

    expect(existsSync(join(userData, 'models'))).toBe(false)
  })

  it('never deletes a folder beside the stash folder, even with --all', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { userData, stash } = setup((home) => join(home, 'Documents', 'DesignStash'))
    const beside = join(stash, '..', 'models')
    mkdirSync(beside, { recursive: true })
    writeFileSync(join(beside, 'training.csv'), 'mine')

    await devReset({ userData, all: true })

    expect(existsSync(join(beside, 'training.csv'))).toBe(true)
  })

  it('keeps the dev tooling that lives in dev’s folder: llama-server, the helper and ai-eval', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { userData } = setup()
    for (const tool of ['llama-server', 'helper', 'ai-eval']) {
      mkdirSync(join(userData, tool), { recursive: true })
      writeFileSync(join(userData, tool, 'keep'), 'x')
    }

    await devReset({ userData, all: false })

    for (const tool of ['llama-server', 'helper', 'ai-eval'])
      expect(existsSync(join(userData, tool, 'keep'))).toBe(true)
    expect(existsSync(join(userData, 'settings.json'))).toBe(false)
    expect(existsSync(join(userData, 'Library'))).toBe(false)
  })

  it('refuses a stash folder at the root of the disk', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { userData } = setup()
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({ libraryRoot: '/' }))

    await expect(devReset({ userData, all: true })).rejects.toThrow(/unsafe/)
    expect(existsSync(userData)).toBe(true)
  })
})
