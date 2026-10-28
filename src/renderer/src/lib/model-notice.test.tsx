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

let pushed: ((payload: unknown) => void) | null = null
const subscribe = vi.fn((channel: string, callback: (payload: unknown) => void) => {
  if (channel === IPC_CHANNELS.AI_STATUS) pushed = callback
  return () => {}
})

beforeEach(() => {
  toast.mockReset()
  invoke.mockReset()
  pushed = null
  window.api = { invoke, subscribe } as unknown as typeof window.api
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

describe('a runtime that breaks while the window is open (F-038)', () => {
  it('checks again when a mockup fails, and says so once', async () => {
    invoke.mockResolvedValueOnce(listing(null))
    renderHook(() => useActiveModelNotice())
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))
    expect(pushed).not.toBeNull()

    const failed = { updates: [{ mockupId: 7, status: 'failed' }], totals: { total: 3, remaining: 1 } }
    invoke.mockResolvedValue(listing('runtime-failed'))
    act(() => pushed!(failed))
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1))
    expect(toast.mock.calls[0]![0]).toMatchObject({ message: 'The AI model won’t start', action: { label: 'Choose a model' } })

    act(() => pushed!(failed))
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(3))
    expect(toast).toHaveBeenCalledTimes(1)
  })

  it('asks nothing for a mockup that was written', async () => {
    invoke.mockResolvedValue(listing(null))
    renderHook(() => useActiveModelNotice())
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))
    act(() => pushed!({ updates: [{ mockupId: 7, status: 'ready' }], totals: { total: 3, remaining: 0 } }))
    await Promise.resolve()
    expect(invoke).toHaveBeenCalledTimes(1)
  })
})

describe('a model that stops being able to run while the window is open (H-1)', () => {
  it('says so at once when suggestions start waiting for the model, without waiting for focus', async () => {
    invoke.mockResolvedValueOnce(listing(null))
    renderHook(() => useActiveModelNotice())
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))

    invoke.mockResolvedValue(listing('apple-intelligence-off'))
    act(() =>
      pushed!({
        updates: [{ mockupId: 7, status: 'pending' }],
        totals: { total: 3, remaining: 1 },
        modelUnavailable: true
      })
    )
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1))
    expect(toast.mock.calls[0]![0]).toMatchObject({ action: { label: 'Choose a model' } })
  })
})

describe('activeProblemCopy', () => {
  it('words every problem plainly, without em dashes', () => {
    for (const problem of ['apple-intelligence-off', 'apple-model-not-ready', 'apple-unavailable', 'runtime-failed', 'runtime-missing'] as const) {
      const { title, message } = activeProblemCopy(problem)
      expect(title.length).toBeGreaterThan(0)
      expect(message).toMatch(/no suggestions/)
      expect(`${title}${message}`).not.toContain('—')
    }
  })

  it("points Apple's problems and a failing runtime at another model, and a missing runtime at reinstalling", () => {
    for (const problem of ['apple-intelligence-off', 'apple-model-not-ready', 'apple-unavailable', 'runtime-failed'] as const) {
      expect(activeProblemCopy(problem).message).toMatch(/another model/)
    }
    expect(activeProblemCopy('runtime-missing').message).toMatch(/Reinstalling DesignStash/)
  })
})
