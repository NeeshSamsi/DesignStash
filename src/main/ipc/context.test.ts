import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import { createSettingsStore } from '../settings'
import type { Repository } from '../db/repository'

vi.mock('electron', () => ({ app: { on: vi.fn() }, shell: { openPath: vi.fn() } }))

import { app } from 'electron'
import { createAiRuntime, createPush } from './context'

const fakeWindow = (destroyed = false) => {
  const send = vi.fn()
  const window = { isDestroyed: () => destroyed, webContents: { send } } as unknown as BrowserWindow
  return { window, send }
}

const payload = { count: 1 } as never

describe('createPush', () => {
  it('sends to the window that is open now', () => {
    const first = fakeWindow()
    const second = fakeWindow()
    let current: BrowserWindow | null = first.window
    const push = createPush(() => current)

    push(IPC_CHANNELS.INBOX_COUNTS_CHANGED, payload)
    current = second.window
    push(IPC_CHANNELS.INBOX_COUNTS_CHANGED, payload)

    expect(first.send).toHaveBeenCalledTimes(1)
    expect(second.send).toHaveBeenCalledTimes(1)
  })

  it('does nothing with no window or a destroyed one', () => {
    const destroyed = fakeWindow(true)
    expect(() => createPush(() => null)(IPC_CHANNELS.INBOX_COUNTS_CHANGED, payload)).not.toThrow()
    createPush(() => destroyed.window)(IPC_CHANNELS.INBOX_COUNTS_CHANGED, payload)
    expect(destroyed.send).not.toHaveBeenCalled()
  })
})

/** Meaning search only needs somewhere to hang its index listener here. */
const repoStub = { search: { setIndexListener: vi.fn() } } as unknown as Repository

describe('createAiRuntime', () => {
  let base: string | null = null
  afterEach(() => {
    if (base) rmSync(base, { recursive: true, force: true })
    base = null
  })
  const settingsWith = (activeModelId: string | null) => {
    base = mkdtempSync(join(tmpdir(), 'ds-ai-runtime-'))
    const settings = createSettingsStore(base)
    settings.update({ activeModelId })
    return settings
  }

  it('starts with no model chosen when the stored one left the catalogue', async () => {
    const settings = settingsWith('qwen2.5-vl-3b')
    const ai = createAiRuntime(settings, repoStub)
    expect(settings.get().activeModelId).toBeNull()
    await expect(ai.activeProvider()).resolves.toBeNull()
  })

  it('has no provider for a Qwen model whose files are not there', async () => {
    const ai = createAiRuntime(settingsWith('qwen3-vl-4b'), repoStub)
    await expect(ai.activeProvider()).resolves.toBeNull()
  })

  it('clears the after-launch meaning backfill when the app quits', () => {
    vi.useFakeTimers()
    try {
      const backfill = vi.fn()
      const repo = {
        search: { setIndexListener: vi.fn(), meaningDocuments: backfill }
      } as unknown as Repository
      vi.mocked(app.on).mockClear()
      createAiRuntime(settingsWith(null), repo)
      const quit = vi
        .mocked(app.on)
        .mock.calls.find(([name]) => (name as string) === 'will-quit')?.[1] as () => void
      quit()
      vi.advanceTimersByTime(20_000)
      expect(backfill).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
