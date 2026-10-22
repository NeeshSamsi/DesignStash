import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IPC_CHANNELS } from '@shared/ipc'

const toast = vi.hoisted(() => vi.fn())
vi.mock('../stores/toastStore', () => ({ toast }))

import { useUpdateNotice } from './update-notice'

const available = {
  state: 'available',
  version: '0.2.0',
  notes: 'n',
  releaseUrl: 'https://github.com/NeeshSamsi/DesignStash/releases/tag/v0.2.0',
  lastCheckedAt: null
}
const invoke = vi.fn()

beforeEach(() => {
  toast.mockReset()
  invoke.mockReset()
  localStorage.clear()
  window.api = { invoke } as unknown as typeof window.api
})

describe('useUpdateNotice', () => {
  it('says a new version is out once, with a Download action', async () => {
    invoke.mockResolvedValue({ success: true, data: available })
    const first = renderHook(() => useUpdateNotice())
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1))
    expect(toast.mock.calls[0][0]).toMatchObject({
      message: 'DesignStash 0.2.0 is out',
      action: { label: 'Download' }
    })
    toast.mock.calls[0][0].action.onClick()
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.UPDATES_INSTALL, undefined)
    first.unmount()

    renderHook(() => useUpdateNotice())
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(3))
    expect(toast).toHaveBeenCalledTimes(1)
  })

  it('says it again for a later version', async () => {
    localStorage.setItem('ds:update-notice', '0.1.5')
    invoke.mockResolvedValue({ success: true, data: available })
    renderHook(() => useUpdateNotice())
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1))
  })

  it('stays quiet when up to date, when the check failed, and when the call fails', async () => {
    for (const reply of [
      { success: true, data: { state: 'up-to-date', lastCheckedAt: null } },
      { success: true, data: { state: 'check-failed', lastCheckedAt: null } },
      { success: false }
    ]) {
      invoke.mockResolvedValueOnce(reply)
      renderHook(() => useUpdateNotice())
    }
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(3))
    await Promise.resolve()
    expect(toast).not.toHaveBeenCalled()
  })
})
