import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IPC_CHANNELS } from '@shared/ipc'
import type { DesignStashApi } from '@shared/api'

const on = vi.fn()
const removeListener = vi.fn()
let exposed: DesignStashApi

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_key: string, api: DesignStashApi) => {
      exposed = api
    }
  },
  ipcRenderer: { invoke: vi.fn(), on, removeListener },
  webUtils: { getPathForFile: vi.fn() }
}))

beforeEach(async () => {
  on.mockClear()
  removeListener.mockClear()
  vi.resetModules()
  await import('./index')
})

describe('preload subscribe', () => {
  it('relays a push channel and returns an unsubscribe', () => {
    const cb = vi.fn()
    const off = exposed.subscribe(IPC_CHANNELS.INBOX_COUNTS_CHANGED, cb)
    expect(on).toHaveBeenCalledWith(IPC_CHANNELS.INBOX_COUNTS_CHANGED, expect.any(Function))

    const handler = on.mock.calls[0]![1] as (e: unknown, payload: unknown) => void
    handler({}, { phase: 'done' })
    expect(cb).toHaveBeenCalledWith({ phase: 'done' })

    off()
    expect(removeListener).toHaveBeenCalledWith(IPC_CHANNELS.INBOX_COUNTS_CHANGED, handler)
  })

  it('refuses channels outside the push allowlist', () => {
    const bad = IPC_CHANNELS.TAG_TREE as unknown as Parameters<DesignStashApi['subscribe']>[0]
    expect(() => exposed.subscribe(bad, vi.fn())).toThrow(/Not a push channel/)
    expect(on).not.toHaveBeenCalled()
  })

  it('keeps the old progress listeners as wrappers over subscribe', () => {
    const cb = vi.fn()
    exposed.onAiDownloadProgress(cb)
    expect(on).toHaveBeenCalledWith(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, expect.any(Function))
    const handler = on.mock.calls[0]![1] as (e: unknown, payload: unknown) => void
    handler({}, { modelId: 'm' })
    expect(cb).toHaveBeenCalledWith({ modelId: 'm' })
  })
})
