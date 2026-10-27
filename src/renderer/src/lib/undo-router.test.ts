import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import {
  ipcUndoRoutes,
  routeUndo,
  setRendererUndo,
  undoContext,
  useFlowUndo,
  useUndoContextReport,
  useUndoRan,
  type FlowUndo
} from './undo-router'

const toasts = vi.hoisted(() => ({ toast: vi.fn(), undoToast: vi.fn() }))
vi.mock('@renderer/stores/toastStore', () => toasts)

// ⌘Z and Edit › Undo act on the innermost context (design/specs/undo.md, The rule): a text field,
// then an open flow (Sort, Look it over), then the app's history.

const app = vi.fn(async () => {})
const fieldFallback = vi.fn(async () => {})
const deps = { app, fieldFallback }

function field(tag: 'input' | 'textarea' = 'input', type = 'text') {
  const el = document.createElement(tag)
  if (tag === 'input') (el as HTMLInputElement).type = type
  document.body.append(el)
  el.focus()
  return el
}

const flow = () => ({ undo: vi.fn<() => void>(), redo: vi.fn<() => void>() })

let execCommand: ReturnType<typeof vi.fn>

beforeEach(() => {
  app.mockClear()
  fieldFallback.mockClear()
  execCommand = vi.fn(() => true)
  document.execCommand = execCommand as unknown as typeof document.execCommand
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('undoContext', () => {
  it('is the app with nothing focused and no flow open', () => {
    expect(undoContext()).toBe('app')
  })

  it('is a field while one has focus, a flow open or not', () => {
    const { unmount } = renderHook(() => useFlowUndo(flow()))
    field()
    expect(undoContext()).toBe('field')
    unmount()
  })

  it('is the flow while one is open and focus is outside a field', () => {
    const { unmount } = renderHook(() => useFlowUndo(flow()))
    document.body.append(document.createElement('button'))
    expect(undoContext()).toBe('flow')
    unmount()
    expect(undoContext()).toBe('app')
  })

  it('counts only fields people type in: a checkbox is not one', () => {
    field('input', 'checkbox')
    expect(undoContext()).toBe('app')
    field('textarea')
    expect(undoContext()).toBe('field')
  })
})

describe('routeUndo', () => {
  it('a field undoes its own typing, and nothing else hears it', async () => {
    const steps = flow()
    const { unmount } = renderHook(() => useFlowUndo(steps))
    field()
    expect(await routeUndo('undo', deps)).toBe('field')
    expect(execCommand).toHaveBeenCalledWith('undo')
    expect(steps.undo).not.toHaveBeenCalled()
    expect(app).not.toHaveBeenCalled()
    await routeUndo('redo', deps)
    expect(execCommand).toHaveBeenLastCalledWith('redo')
    unmount()
  })

  it('a field the page can’t undo in asks main to', async () => {
    execCommand.mockReturnValue(false)
    field()
    await routeUndo('undo', deps)
    expect(fieldFallback).toHaveBeenCalledWith('undo')
  })

  it('an open flow takes its own last step back, and forward on redo', async () => {
    const steps = flow()
    const { unmount } = renderHook(() => useFlowUndo(steps))
    expect(await routeUndo('undo', deps)).toBe('flow')
    expect(steps.undo).toHaveBeenCalledTimes(1)
    await routeUndo('redo', deps)
    expect(steps.redo).toHaveBeenCalledTimes(1)
    expect(app).not.toHaveBeenCalled()
    unmount()
  })

  it('the newest flow open wins, and the one under it takes over when it closes', async () => {
    const under = flow()
    const over = flow()
    const first = renderHook(() => useFlowUndo(under))
    const second = renderHook(() => useFlowUndo(over))
    await routeUndo('undo', deps)
    expect(over.undo).toHaveBeenCalledTimes(1)
    second.unmount()
    await routeUndo('undo', deps)
    expect(under.undo).toHaveBeenCalledTimes(1)
    first.unmount()
  })

  it('a flow always runs its latest handlers', async () => {
    const before = flow()
    const after = flow()
    const { rerender, unmount } = renderHook((steps: FlowUndo) => useFlowUndo(steps), {
      initialProps: before
    })
    rerender(after)
    await routeUndo('undo', deps)
    expect(before.undo).not.toHaveBeenCalled()
    expect(after.undo).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('anywhere else goes to the app’s history', async () => {
    expect(await routeUndo('undo', deps)).toBe('app')
    expect(app).toHaveBeenCalledWith('undo')
    await routeUndo('redo', deps)
    expect(app).toHaveBeenLastCalledWith('redo')
  })
})

describe('the app’s history, through main', () => {
  let answer: unknown
  let invoke: ReturnType<typeof vi.fn>

  beforeEach(() => {
    toasts.toast.mockClear()
    answer = { status: 'done', label: 'Move to Trash' }
    invoke = vi.fn(async () => ({ success: true, data: answer }))
    window.api = { invoke } as unknown as typeof window.api
  })

  it('undo:run and redo:run, and the screens hear it ran so they reload', async () => {
    const ran = vi.fn()
    const { unmount } = renderHook(() => useUndoRan(ran))
    await routeUndo('undo', ipcUndoRoutes)
    expect(invoke).toHaveBeenLastCalledWith(IPC_CHANNELS.UNDO_RUN, undefined)
    await routeUndo('redo', ipcUndoRoutes)
    expect(invoke).toHaveBeenLastCalledWith(IPC_CHANNELS.REDO_RUN, undefined)
    expect(ran).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('nothing to undo is quiet', async () => {
    answer = { status: 'empty' }
    const ran = vi.fn()
    const { unmount } = renderHook(() => useUndoRan(ran))
    await routeUndo('undo', ipcUndoRoutes)
    expect(ran).not.toHaveBeenCalled()
    expect(toasts.toast).not.toHaveBeenCalled()
    unmount()
  })

  it('a step whose mockup was deleted for good says so, and the screens still reload', async () => {
    answer = {
      status: 'dropped',
      label: 'Edit details',
      reason: 'that mockup was deleted for good'
    }
    await routeUndo('undo', ipcUndoRoutes)
    expect(toasts.toast).toHaveBeenCalledWith({
      variant: 'error',
      message: 'Couldn’t undo Edit details: that mockup was deleted for good'
    })
  })

  it('hands an entry only the window can carry out to whoever does it', async () => {
    const values = { title: 'Clay', description: 'Mine', tagIds: [2] }
    answer = {
      status: 'done',
      label: 'Discard your changes',
      renderer: { kind: 'reopen-editor', mockupId: 4, values }
    }
    const carry = vi.fn()
    const off = setRendererUndo(carry)
    await routeUndo('undo', ipcUndoRoutes)
    expect(carry).toHaveBeenCalledWith({ kind: 'reopen-editor', mockupId: 4, values })
    off()
  })

  it('a field the page can’t undo in goes to main’s webContents', async () => {
    document.execCommand = vi.fn(() => false) as unknown as typeof document.execCommand
    field()
    await routeUndo('redo', ipcUndoRoutes)
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.UNDO_FIELD, { direction: 'redo' })
  })
})

describe('telling main where ⌘Z lands, for the Edit menu’s label', () => {
  let invoke: ReturnType<typeof vi.fn>
  const reported = () =>
    invoke.mock.calls
      .filter(([channel]) => channel === IPC_CHANNELS.UNDO_CONTEXT)
      .map(([, payload]) => (payload as { context: string }).context)

  beforeEach(() => {
    invoke = vi.fn(async () => ({ success: true, data: undefined }))
    window.api = { invoke } as unknown as typeof window.api
  })

  it('reports where it lands as it changes, and only when it changes', async () => {
    const { unmount } = renderHook(() => useUndoContextReport())
    await waitFor(() => expect(reported()).toEqual(['app']))
    const input = field()
    await waitFor(() => expect(reported()).toEqual(['app', 'field']))
    const flowHook = renderHook(() => useFlowUndo(flow()))
    act(() => input.blur())
    await waitFor(() => expect(reported()).toEqual(['app', 'field', 'flow']))
    flowHook.unmount()
    await waitFor(() => expect(reported()).toEqual(['app', 'field', 'flow', 'app']))
    unmount()
  })
})
