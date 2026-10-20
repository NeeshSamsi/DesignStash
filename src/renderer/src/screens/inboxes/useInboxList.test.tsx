import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { InboxItem } from '@shared/inbox'
import { useInboxStore } from '@renderer/stores/inboxStore'
import { useInboxList } from './useInboxList'

const card = (id: number) => ({ id, title: `Mockup ${id}` }) as unknown as InboxItem

beforeEach(() => {
  useInboxStore.getState().reset()
  window.api = {
    invoke: vi.fn(async () => ({ success: true, data: { items: [card(1), card(2)] } })),
    subscribe: vi.fn(() => () => {}),
  } as unknown as typeof window.api
})

describe('useInboxList', () => {
  it('shows the last list at once on return and refreshes it in the background', async () => {
    const first = renderHook(() => useInboxList('to_sort'))
    expect(first.result.current.items).toBeNull()
    await waitFor(() => expect(first.result.current.items).toHaveLength(2))
    first.unmount()

    vi.mocked(window.api.invoke).mockImplementation(() => new Promise(() => {}))
    const again = renderHook(() => useInboxList('to_sort'))
    expect(again.result.current.items).toHaveLength(2)
    expect(window.api.invoke).toHaveBeenLastCalledWith(IPC_CHANNELS.INBOX_LIST, {
      stage: 'to_sort'
    })
  })
})
