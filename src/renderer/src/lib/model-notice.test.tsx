import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AiActiveProblem } from '@shared/ipc/ai'
import { useUiStore } from '../stores/uiStore'

const toast = vi.hoisted(() => vi.fn())
vi.mock('../stores/toastStore', () => ({ toast }))

import { activeProblemCopy, useActiveModelNotice } from './model-notice'

const invoke = vi.fn()
const listing = (activeProblem: AiActiveProblem | null) => ({
  success: true,
  data: { models: [], legacy: [], activeProblem }
})

beforeEach(() => {
  toast.mockReset()
  invoke.mockReset()
  window.api = { invoke } as unknown as typeof window.api
})

describe('useActiveModelNotice', () => {
  it('says why suggestions stopped, with a way to choose another model', async () => {
    invoke.mockResolvedValue(listing('apple-intelligence-off'))
    renderHook(() => useActiveModelNotice())
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1))
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.AI_LIST_MODELS, undefined)
    const shown = toast.mock.calls[0]![0]
    expect(shown).toMatchObject({
      variant: 'error',
      message: 'Apple Intelligence is turned off',
      action: { label: 'Choose a model' }
    })
    shown.action.onClick()
    expect(useUiStore.getState().settingsSection).toBe('ai-model')
  })

  it('checks again when the window comes back, and speaks only when the problem is new', async () => {
    invoke.mockResolvedValueOnce(listing('apple-intelligence-off'))
    renderHook(() => useActiveModelNotice())
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1))

    const focus = async (problem: AiActiveProblem | null, calls: number) => {
      invoke.mockResolvedValueOnce(listing(problem))
      act(() => {
        window.dispatchEvent(new Event('focus'))
      })
      await waitFor(() => expect(invoke).toHaveBeenCalledTimes(calls))
    }
    await focus('apple-intelligence-off', 2)
    expect(toast).toHaveBeenCalledTimes(1)
    await focus(null, 3)
    await focus('apple-intelligence-off', 4)
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(2))
  })

  it('stays quiet when the model can run or the call fails', async () => {
    invoke.mockResolvedValueOnce(listing(null)).mockResolvedValueOnce({ success: false })
    renderHook(() => useActiveModelNotice())
    renderHook(() => useActiveModelNotice())
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2))
    await Promise.resolve()
    expect(toast).not.toHaveBeenCalled()
  })
})

describe('activeProblemCopy', () => {
  it('words every problem plainly, without em dashes', () => {
    for (const problem of ['apple-intelligence-off', 'apple-model-not-ready', 'apple-unavailable'] as const) {
      const { title, message } = activeProblemCopy(problem)
      expect(title.length).toBeGreaterThan(0)
      expect(message).toMatch(/another model/)
      expect(`${title}${message}`).not.toContain('—')
    }
  })
})
