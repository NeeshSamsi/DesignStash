import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IPC_CHANNELS } from '@shared/ipc'
import { subscribePush } from './subscribe'

let relay: (payload: unknown) => void
const off = vi.fn()

beforeEach(() => {
  off.mockClear()
  window.api = {
    subscribe: vi.fn((_channel: string, cb: (payload: unknown) => void) => {
      relay = cb
      return off
    })
  } as unknown as typeof window.api
})

describe('subscribePush', () => {
  it('delivers payloads that match the channel schema', () => {
    const cb = vi.fn()
    subscribePush(IPC_CHANNELS.INBOX_COUNTS_CHANGED, cb)
    expect(window.api.subscribe).toHaveBeenCalledWith(IPC_CHANNELS.INBOX_COUNTS_CHANGED, expect.any(Function))
    const payload = { toSort: 1, toStash: 2, sniffing: 0, trash: 3 }
    relay(payload)
    expect(cb).toHaveBeenCalledWith(payload)
  })

  it('drops payloads that fail validation', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cb = vi.fn()
    subscribePush(IPC_CHANNELS.INBOX_COUNTS_CHANGED, cb)
    relay({ toSort: 'many' })
    expect(cb).not.toHaveBeenCalled()
    err.mockRestore()
  })

  it('returns the unsubscribe from the bridge', () => {
    subscribePush(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, vi.fn())()
    expect(off).toHaveBeenCalled()
  })
})
