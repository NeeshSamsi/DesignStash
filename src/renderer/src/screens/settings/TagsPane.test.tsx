import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import { useTagTreeStore } from '../../stores/tagTreeStore'
import { TagsPane } from './TagsPane'

// Settings › Tags, the pane's side: what it says when main refuses a name (design/specs/settings.md).

const toasts = vi.hoisted(() => ({ toast: vi.fn(), undoToast: vi.fn() }))
vi.mock('@renderer/stores/toastStore', () => toasts)
vi.mock('../../stores/toastStore', () => toasts)

/** How each handler the tree called ended: the tree keeps its input open on a rejection. */
const outcomes = vi.hoisted(() => [] as ('done' | 'refused')[])

// The tree has its own tests; here it is a stand-in with one button per change.
vi.mock('../../components/TagTree', () => ({
  TagTree: (p: Record<string, (...args: unknown[]) => unknown>) => {
    const fire = (fn: ((...args: unknown[]) => unknown) | undefined, ...args: unknown[]) =>
      void Promise.resolve(fn?.(...args)).then(
        () => outcomes.push('done'),
        () => outcomes.push('refused')
      )
    return (
      <div>
        <button onClick={() => fire(p.onRenameTag, 7, 'iphone')}>rename tag</button>
        <button onClick={() => fire(p.onRenameCategory, 3, 'angle')}>rename category</button>
        <button onClick={() => fire(p.onMoveTag, 7, 4)}>move tag</button>
      </div>
    )
  }
}))

const ok = (data: unknown) => ({ success: true, data })
let invoke: ReturnType<typeof vi.fn>

function setup(handlers: Record<string, () => unknown>) {
  invoke = vi.fn(async (channel: string) =>
    channel === IPC_CHANNELS.TAG_TREE ? ok({ tree: [] }) : (handlers[channel]?.() ?? ok({}))
  )
  window.api = { appName: 'DesignStash', invoke, getPathForFile: vi.fn() } as unknown as typeof window.api
}

const taken = (label: string, categoryLabel?: string) =>
  ok({ ok: false, reason: 'taken', label, ...(categoryLabel && { categoryLabel }) })

beforeEach(() => {
  toasts.toast.mockClear()
  outcomes.length = 0
  useTagTreeStore.getState().reset()
})

describe('TagsPane · a name that is taken', () => {
  it('renaming a tag to a name its category has says which tag, and keeps the input open', async () => {
    setup({ [IPC_CHANNELS.TAG_RENAME]: () => taken('iPhone', 'Device') })
    render(<TagsPane />)
    fireEvent.click(screen.getByText('rename tag'))

    await waitFor(() => expect(outcomes).toEqual(['refused']))
    expect(toasts.toast).toHaveBeenCalledWith({
      variant: 'error',
      message: '“iPhone” is already a tag in Device',
      description: 'Pick another name.'
    })
  })

  it('renaming a category to a name another has says so', async () => {
    setup({ [IPC_CHANNELS.CATEGORY_RENAME]: () => taken('Angle') })
    render(<TagsPane />)
    fireEvent.click(screen.getByText('rename category'))

    await waitFor(() => expect(outcomes).toEqual(['refused']))
    expect(toasts.toast).toHaveBeenCalledWith({
      variant: 'error',
      message: 'There’s already a category called “Angle”',
      description: 'Pick another name.'
    })
  })

  it('moving a tag into a category with one of the same name says so, and how to get there', async () => {
    setup({ [IPC_CHANNELS.TAG_SET_CATEGORY]: () => taken('Side', 'Environment') })
    render(<TagsPane />)
    fireEvent.click(screen.getByText('move tag'))

    await waitFor(() => expect(outcomes).toEqual(['refused']))
    expect(toasts.toast).toHaveBeenCalledWith({
      variant: 'error',
      message: '“Side” is already a tag in Environment',
      description: 'Merge the two, or rename one first.'
    })
  })

  it('a rename that goes through says nothing and reloads the tree', async () => {
    setup({ [IPC_CHANNELS.TAG_RENAME]: () => ok({ ok: true }) })
    render(<TagsPane />)
    await waitFor(() => expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.TAG_TREE, undefined))
    const loads = () => invoke.mock.calls.filter(([c]) => c === IPC_CHANNELS.TAG_TREE).length
    const before = loads()
    fireEvent.click(screen.getByText('rename tag'))

    await waitFor(() => expect(outcomes).toEqual(['done']))
    expect(toasts.toast).not.toHaveBeenCalled()
    expect(loads()).toBeGreaterThan(before)
  })
})
