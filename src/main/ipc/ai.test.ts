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
let appleReady: boolean
let appleReason: string
let embeddings: {
  setBusyCheck: ReturnType<typeof vi.fn>
  backfill: ReturnType<typeof vi.fn>
  similarities: ReturnType<typeof vi.fn>
  modelRemoved: ReturnType<typeof vi.fn>
}

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
  appleReady = false
  embeddings = {
    setBusyCheck: vi.fn(),
    backfill: vi.fn(),
    similarities: vi.fn(async () => null),
    modelRemoved: vi.fn(async () => {})
  }
  appleReason = 'appleIntelligenceNotEnabled'
  registerAiHandlers({
    settings,
    push,
    telemetry: { get: () => ({ track: vi.fn() }) },
    ai: {
      modelsDir,
      downloader: new ModelDownloader(modelsDir),
      activeDownloads,
      appleStatus: async () =>
        appleReady ? { available: true, reason: null } : { available: false, reason: appleReason },
      embeddings
    }
  } as unknown as HandlerContext)
})

afterEach(() => rmSync(base, { recursive: true, force: true }))

type ListedModel = {
  id: string
  installed: boolean
  bestFit: boolean
  builtIn: boolean
  sizeBytes: number
}
const listModels = async () => {
  const res = await call<{ models: ListedModel[]; legacy: { id: string }[] }>(
    IPC_CHANNELS.AI_LIST_MODELS
  )
  if (!res.success) throw new Error('AI_LIST_MODELS failed')
  return res.data
}

describe('AI_LIST_MODELS: the active model can’t run', () => {
  const problem = async () => {
    const res = await call<{ activeProblem: string | null }>(IPC_CHANNELS.AI_LIST_MODELS)
    if (!res.success) throw new Error('AI_LIST_MODELS failed')
    return res.data.activeProblem
  }

  it('says Apple Intelligence is off when Apple’s model is in use and the helper says so', async () => {
    settings.update({ activeModelId: 'apple' })
    expect(await problem()).toBe('apple-intelligence-off')
  })

  it('says macOS is still getting Apple’s model ready, or that it can’t run here', async () => {
    settings.update({ activeModelId: 'apple' })
    appleReason = 'modelNotReady'
    expect(await problem()).toBe('apple-model-not-ready')
    appleReason = 'deviceNotEligible'
    expect(await problem()).toBe('apple-unavailable')
  })

  it('has no problem when Apple’s model can run, or another model is in use', async () => {
    settings.update({ activeModelId: 'apple' })
    appleReady = true
    expect(await problem()).toBeNull()
    appleReady = false
    settings.update({ activeModelId: 'qwen3-vl-4b' })
    expect(await problem()).toBeNull()
    settings.update({ activeModelId: null })
    expect(await problem()).toBeNull()
  })
})

describe('AI_LIST_MODELS', () => {
  it('lists the two Qwen models with Qwen3-VL 4B as Best fit, and old models apart', async () => {
    install('qwen3-vl-4b')
    install('qwen2.5-1.5b', ['old.gguf'])

    const { models, legacy } = await listModels()
    expect(models.map((m) => m.id)).toEqual(['qwen3-vl-4b', 'qwen3.5-9b'])
    expect(models.filter((m) => m.bestFit).map((m) => m.id)).toEqual(['qwen3-vl-4b'])
    expect(models.find((m) => m.id === 'qwen3-vl-4b')?.installed).toBe(true)
    expect(models.every((m) => !m.builtIn)).toBe(true)
    expect(legacy.map((l) => l.id)).toEqual(['qwen2.5-1.5b'])
  })

  it('lists the removed Qwen 2.5 models as old folders, with their files left on disk', async () => {
    install('qwen2.5-vl-3b')
    install('qwen2.5-vl-7b')
    const { models, legacy } = await listModels()
    expect(models.map((m) => m.id)).not.toContain('qwen2.5-vl-3b')
    expect(legacy.map((l) => l.id).sort()).toEqual(['qwen2.5-vl-3b', 'qwen2.5-vl-7b'])
    expect(existsSync(join(modelsDir, 'qwen2.5-vl-3b', 'model.gguf'))).toBe(true)
  })

  it('adds Apple’s model, built in and ready, only when the helper says it is available', async () => {
    appleReady = true
    const { models } = await listModels()
    expect(models.map((m) => m.id)).toEqual(['qwen3-vl-4b', 'qwen3.5-9b', 'apple'])
    expect(models.find((m) => m.id === 'apple')).toMatchObject({
      builtIn: true,
      installed: true,
      bestFit: false,
      sizeBytes: 0
    })
  })

  it('shows no model as active when the stored one was removed from the catalogue', async () => {
    settings.update({ activeModelId: 'qwen2.5-vl-3b' })
    const res = await call<{ models: { active: boolean }[] }>(IPC_CHANNELS.AI_LIST_MODELS)
    expect(res.success && res.data.models.some((m) => m.active)).toBe(false)
  })
})

describe('AI_DELETE_MODEL', () => {
  it('deletes a model that is not in use at once, and Undo brings it back', async () => {
    install('qwen3.5-9b')

    expect(await call(IPC_CHANNELS.AI_DELETE_MODEL, { id: 'qwen3.5-9b' })).toEqual({
      success: true,
      data: { deleted: true, inUse: false, undoable: true }
    })
    expect(existsSync(join(modelsDir, 'qwen3.5-9b'))).toBe(false)

    expect(await call(IPC_CHANNELS.AI_RESTORE_MODEL, { id: 'qwen3.5-9b' })).toEqual({
      success: true,
      data: { restored: true }
    })
    expect(existsSync(join(modelsDir, 'qwen3.5-9b', 'model.gguf'))).toBe(true)
  })

  it('keeps the model in use and says so until the user confirms', async () => {
    install('qwen3-vl-4b')
    settings.update({ activeModelId: 'qwen3-vl-4b' })

    expect(await call(IPC_CHANNELS.AI_DELETE_MODEL, { id: 'qwen3-vl-4b' })).toEqual({
      success: true,
      data: { deleted: false, inUse: true, undoable: false }
    })
    expect(existsSync(join(modelsDir, 'qwen3-vl-4b', 'model.gguf'))).toBe(true)
    expect(settings.get().activeModelId).toBe('qwen3-vl-4b')
  })

  it('deletes the model in use once confirmed, stops using it, and Undo can make it active again', async () => {
    install('qwen3-vl-4b')
    settings.update({ activeModelId: 'qwen3-vl-4b' })

    expect(
      await call(IPC_CHANNELS.AI_DELETE_MODEL, { id: 'qwen3-vl-4b', confirmed: true })
    ).toEqual({
      success: true,
      data: { deleted: true, inUse: true, undoable: true }
    })
    expect(settings.get().activeModelId).toBeNull()

    await call(IPC_CHANNELS.AI_RESTORE_MODEL, { id: 'qwen3-vl-4b', makeActive: true })
    expect(settings.get().activeModelId).toBe('qwen3-vl-4b')
  })

  it('stops a download of the model being deleted', async () => {
    install('qwen3.5-9b')
    const controller = new AbortController()
    activeDownloads.set('qwen3.5-9b', controller)

    await call(IPC_CHANNELS.AI_DELETE_MODEL, { id: 'qwen3.5-9b' })

    expect(controller.signal.aborted).toBe(true)
    expect(activeDownloads.has('qwen3.5-9b')).toBe(false)
  })

  it('never deletes Apple’s built-in model', async () => {
    settings.update({ activeModelId: 'apple' })
    expect(await call(IPC_CHANNELS.AI_DELETE_MODEL, { id: 'apple', confirmed: true })).toEqual({
      success: true,
      data: { deleted: false, inUse: false, undoable: false }
    })
    expect(settings.get().activeModelId).toBe('apple')
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
    expect(await call(IPC_CHANNELS.AI_DELETE_MODEL, { id: 'qwen3.5-9b' })).toEqual({
      success: true,
      data: { deleted: false, inUse: false, undoable: false }
    })
  })
})

describe('AI_DOWNLOAD_MODEL tracking', () => {
  it('keeps a restarted download tracked when the cancelled one settles late', async () => {
    const settle: (() => void)[] = []
    const download = vi.fn(
      () => new Promise<void>((resolve) => settle.push(resolve)) as Promise<never>
    )
    handlers.clear()
    registerAiHandlers({
      settings,
      push,
      telemetry: { get: () => ({ track: vi.fn() }) },
      ai: {
        modelsDir,
        downloader: { purgeSetAside: async () => {}, download },
        activeDownloads,
        embeddings
      }
    } as unknown as HandlerContext)

    const id = 'qwen3-vl-4b'
    expect(await call(IPC_CHANNELS.AI_DOWNLOAD_MODEL, { id })).toMatchObject({
      data: { started: true }
    })
    expect(await call(IPC_CHANNELS.AI_CANCEL_DOWNLOAD, { id })).toMatchObject({
      data: { cancelled: true }
    })
    expect(await call(IPC_CHANNELS.AI_DOWNLOAD_MODEL, { id })).toMatchObject({
      data: { started: true }
    })

    // The cancelled download finally settles.
    settle[0]?.()
    await new Promise((r) => setTimeout(r, 0))

    expect(activeDownloads.has(id)).toBe(true)
    expect(await call(IPC_CHANNELS.AI_DOWNLOAD_MODEL, { id })).toMatchObject({
      data: { started: false }
    })
    expect(await call(IPC_CHANNELS.AI_CANCEL_DOWNLOAD, { id })).toMatchObject({
      data: { cancelled: true }
    })

    settle[1]?.()
    await new Promise((r) => setTimeout(r, 0))
    expect(activeDownloads.has(id)).toBe(false)
  })
})

describe('the meaning-search model', () => {
  const id = 'nomic-embed-v1.5'

  it('is listed beside the vision models but never among them', async () => {
    const res = await call<{
      models: { id: string }[]
      meaning: { id: string; installed: boolean; sizeBytes: number }
    }>(IPC_CHANNELS.AI_LIST_MODELS)
    if (!res.success) throw new Error('list failed')
    expect(res.data.models.map((m) => m.id)).not.toContain(id)
    expect(res.data.meaning).toMatchObject({ id, installed: false, sizeBytes: 146_146_432 })
    install(id, ['model.gguf'])
    const again = await call<{ meaning: { installed: boolean } }>(IPC_CHANNELS.AI_LIST_MODELS)
    expect(again).toMatchObject({ data: { meaning: { installed: true } } })
  })

  it('can not be made the active model', async () => {
    settings.update({ activeModelId: 'qwen3-vl-4b' })
    expect(await call(IPC_CHANNELS.AI_SET_ACTIVE, { id })).toMatchObject({
      data: { modelId: 'qwen3-vl-4b' }
    })
    expect(settings.get().activeModelId).toBe('qwen3-vl-4b')
  })

  it('deletes with Undo, tells search to let go, and catches up when restored', async () => {
    install(id, ['model.gguf'])
    expect(await call(IPC_CHANNELS.AI_DELETE_MODEL, { id })).toEqual({
      success: true,
      data: { deleted: true, inUse: false, undoable: true }
    })
    expect(embeddings.modelRemoved).toHaveBeenCalledTimes(1)
    expect(await call(IPC_CHANNELS.AI_RESTORE_MODEL, { id })).toMatchObject({
      data: { restored: true }
    })
    expect(embeddings.backfill).toHaveBeenCalledTimes(1)
  })
})
