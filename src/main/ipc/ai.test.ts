import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IPC_CHANNELS, type IpcResult } from '@shared/ipc'
import { createSettingsStore, type SettingsStore } from '../settings'
import { ModelDownloader } from '../ai/download'
import type { HandlerContext } from './context'

const handlers = vi.hoisted(
  () => new Map<string, (event: unknown, args: unknown) => Promise<unknown>>()
)
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, args: unknown) => Promise<unknown>) =>
      handlers.set(channel, fn)
  }
}))

import { registerAiHandlers } from './ai'

let base: string
let modelsDir: string
let settings: SettingsStore
let push: ReturnType<typeof vi.fn>
let activeDownloads: Map<string, AbortController>

const call = async <T = unknown>(channel: string, args?: unknown): Promise<IpcResult<T>> =>
  (await handlers.get(channel)!(null, args)) as IpcResult<T>

const install = (id: string, files = ['model.gguf', 'mmproj.gguf']) => {
  mkdirSync(join(modelsDir, id), { recursive: true })
  for (const f of files) writeFileSync(join(modelsDir, id, f), 'xx')
}

beforeEach(() => {
  handlers.clear()
  base = mkdtempSync(join(tmpdir(), 'ds-ai-ipc-'))
  modelsDir = join(base, 'models')
  mkdirSync(modelsDir)
  settings = createSettingsStore(base)
  push = vi.fn()
  activeDownloads = new Map()
  registerAiHandlers({
    settings,
    push,
    telemetry: { get: () => ({ track: vi.fn() }) },
    ai: { modelsDir, downloader: new ModelDownloader(modelsDir), activeDownloads }
  } as unknown as HandlerContext)
})

afterEach(() => rmSync(base, { recursive: true, force: true }))

describe('AI_LIST_MODELS', () => {
  it('lists the three vision models with Best fit marked, and old text models apart', async () => {
    install('qwen2.5-vl-3b')
    install('qwen2.5-1.5b', ['old.gguf'])

    const res = await call<{
      models: { id: string; installed: boolean; bestFit: boolean }[]
      legacy: { id: string }[]
    }>(IPC_CHANNELS.AI_LIST_MODELS)

    expect(res.success && res.data.models.map((m) => m.id)).toEqual([
      'smolvlm2-2.2b',
      'qwen2.5-vl-3b',
      'qwen2.5-vl-7b'
    ])
    expect(res.success && res.data.models.filter((m) => m.bestFit)).toHaveLength(1)
    expect(res.success && res.data.models.find((m) => m.id === 'qwen2.5-vl-3b')?.installed).toBe(
      true
    )
    expect(res.success && res.data.legacy.map((l) => l.id)).toEqual(['qwen2.5-1.5b'])
  })
})

describe('AI_DELETE_MODEL', () => {
  it('deletes a model that is not in use at once, and Undo brings it back', async () => {
    install('smolvlm2-2.2b')

    expect(await call(IPC_CHANNELS.AI_DELETE_MODEL, { id: 'smolvlm2-2.2b' })).toEqual({
      success: true,
      data: { deleted: true, inUse: false, undoable: true }
    })
    expect(existsSync(join(modelsDir, 'smolvlm2-2.2b'))).toBe(false)

    expect(await call(IPC_CHANNELS.AI_RESTORE_MODEL, { id: 'smolvlm2-2.2b' })).toEqual({
      success: true,
      data: { restored: true }
    })
    expect(existsSync(join(modelsDir, 'smolvlm2-2.2b', 'model.gguf'))).toBe(true)
  })

  it('keeps the model in use and says so until the user confirms', async () => {
    install('qwen2.5-vl-3b')
    settings.update({ activeModelId: 'qwen2.5-vl-3b' })

    expect(await call(IPC_CHANNELS.AI_DELETE_MODEL, { id: 'qwen2.5-vl-3b' })).toEqual({
      success: true,
      data: { deleted: false, inUse: true, undoable: false }
    })
    expect(existsSync(join(modelsDir, 'qwen2.5-vl-3b', 'model.gguf'))).toBe(true)
    expect(settings.get().activeModelId).toBe('qwen2.5-vl-3b')
  })

  it('deletes the model in use once confirmed, stops using it, and Undo can make it active again', async () => {
    install('qwen2.5-vl-3b')
    settings.update({ activeModelId: 'qwen2.5-vl-3b' })

    expect(
      await call(IPC_CHANNELS.AI_DELETE_MODEL, { id: 'qwen2.5-vl-3b', confirmed: true })
    ).toEqual({
      success: true,
      data: { deleted: true, inUse: true, undoable: true }
    })
    expect(settings.get().activeModelId).toBeNull()

    await call(IPC_CHANNELS.AI_RESTORE_MODEL, { id: 'qwen2.5-vl-3b', makeActive: true })
    expect(settings.get().activeModelId).toBe('qwen2.5-vl-3b')
  })

  it('stops a download of the model being deleted', async () => {
    install('smolvlm2-2.2b')
    const controller = new AbortController()
    activeDownloads.set('smolvlm2-2.2b', controller)

    await call(IPC_CHANNELS.AI_DELETE_MODEL, { id: 'smolvlm2-2.2b' })

    expect(controller.signal.aborted).toBe(true)
    expect(activeDownloads.has('smolvlm2-2.2b')).toBe(false)
  })

  it('deletes an old text-model folder for good', async () => {
    install('qwen2.5-1.5b', ['old.gguf'])

    expect(await call(IPC_CHANNELS.AI_DELETE_MODEL, { id: 'qwen2.5-1.5b' })).toEqual({
      success: true,
      data: { deleted: true, inUse: false, undoable: false }
    })
    expect(existsSync(join(modelsDir, 'qwen2.5-1.5b'))).toBe(false)
  })

  it('refuses an id that is a path, and removes nothing outside the models folder', async () => {
    writeFileSync(join(base, 'precious.txt'), 'keep')
    const res = await call(IPC_CHANNELS.AI_DELETE_MODEL, { id: '../precious.txt' })
    expect(res).toMatchObject({ success: false })
    expect(existsSync(join(base, 'precious.txt'))).toBe(true)
  })

  it('reports nothing deleted for a model that is not there', async () => {
    expect(await call(IPC_CHANNELS.AI_DELETE_MODEL, { id: 'smolvlm2-2.2b' })).toEqual({
      success: true,
      data: { deleted: false, inUse: false, undoable: false }
    })
  })
})
