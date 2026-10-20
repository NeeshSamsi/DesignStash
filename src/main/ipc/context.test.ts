import { describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'

vi.mock('electron', () => ({ app: { on: vi.fn() }, shell: { openPath: vi.fn() } }))

import { createPush } from './context'

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
