import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import { createSettingsStore } from '../settings'

vi.mock('electron', () => ({ app: { on: vi.fn() }, shell: { openPath: vi.fn() } }))

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
    const ai = createAiRuntime(settings)
    expect(settings.get().activeModelId).toBeNull()
    await expect(ai.activeProvider()).resolves.toBeNull()
  })

  it('has no provider for a Qwen model whose files are not there', async () => {
    const ai = createAiRuntime(settingsWith('qwen3-vl-4b'))
    await expect(ai.activeProvider()).resolves.toBeNull()
  })
})
