import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import { useUiStore } from '@renderer/stores/uiStore'
import { LookOverFlow } from '@renderer/screens/look-over'

// Behaviour spec for opening, leaving and finishing Look it over (design/specs/inboxes.md,
// piles.md): where it opens, an empty queue, a blank title on the way out, and the done toasts.

const toasts = vi.hoisted(() => ({ toast: vi.fn(), undoToast: vi.fn() }))
vi.mock('@renderer/stores/toastStore', () => toasts)

const ok = (data: unknown) => ({ success: true, data })
const cover = { path: '/c.png', source: 'embedded', missing: false, width: 1600, height: 1200 }

const item = (id: number, role: string, over: Record<string, unknown> = {}) => ({
  mockupId: id,
  pileId: role === 'single' ? null : 10,
  role,
  title: role === 'single' ? `poster ${id}` : 'Apple Watch Ultra',
  variation: role === 'single' ? null : { words: `look ${id}`, source: 'ai' },
  description: `about ${id}`,
  tags: [],
  touched: false,
  checked: true,
  waitingForAi: false,
  carry: null,
  ai: { status: 'ready' },
  cover,
  ...over
})

const single = (id: number) => ({ unitId: id, kind: 'single', items: [item(id, 'single')] })
const pileUnit = { unitId: 10, kind: 'pile', items: [item(10, 'top'), item(11, 'variant')] }

const queue = (units: unknown[], resume: unknown = null) => ({
  units,
  checksEdits: false,
  resume
})

type Handler = (payload: unknown) => unknown
let invoke: ReturnType<typeof vi.fn>
const pushes = new Map<string, (payload: unknown) => void>()

function setup(q: unknown, overrides: Record<string, Handler> = {}) {
  const handlers: Record<string, Handler> = {
    [IPC_CHANNELS.LOOK_OVER_OPEN]: () => ok(q),
    [IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT]: () => ok({ propagatedIds: [] }),
    [IPC_CHANNELS.LOOK_OVER_SET_RESUME]: () => ok({ saved: true }),
    [IPC_CHANNELS.LOOK_OVER_SHOWING]: (p) =>
      ok({ mockupId: (p as { mockupId: number }).mockupId, status: 'ready' }),
    [IPC_CHANNELS.MOCKUP_STASH]: (p) =>
      ok({
        ok: true,
        stashedIds: [(p as { mockupId: number }).mockupId],
        snapshot: { mockups: [], drafts: [], resume: null }
      }),
    [IPC_CHANNELS.TAG_TREE]: () => ok({ tree: [] }),
    ...overrides
  }
  invoke = vi.fn(
    async (channel: string, payload: unknown) => handlers[channel]?.(payload) ?? ok({})
  )
  pushes.clear()
  window.api = {
    appName: 'DesignStash',
    invoke,
    subscribe: vi.fn((channel: string, fn: (payload: unknown) => void) => {
      pushes.set(channel, fn)
      return () => pushes.delete(channel)
    }),
    getPathForFile: vi.fn()
  } as unknown as typeof window.api
}

const calls = (channel: string) =>
  invoke.mock.calls.filter(([c]) => c === channel).map(([, payload]) => payload)
const titleField = () => screen.findByRole('textbox', { name: /^title/i })
const baseField = () => screen.findByRole('textbox', { name: 'Base title' })

beforeEach(() => {
  toasts.toast.mockClear()
  useUiStore.setState({ view: 'to-stash' })
})

describe('Look it over · where it opens', () => {
  it('a card’s Look it over opens on that card, ahead of where Finish later left off', async () => {
    setup(queue([single(30), single(31), single(32)], { unitId: 30, mockupId: 30 }))
    render(<LookOverFlow open scope={{ kind: 'from', unitId: 32 }} onClose={vi.fn()} />)
    expect(((await titleField()) as HTMLInputElement).value).toBe('poster 32')
  })

  it('Look over 2 looks over just those two, then lands back on To stash', async () => {
    setup(queue([single(30), single(31), single(32)]))
    const onClose = vi.fn()
    render(<LookOverFlow open scope={{ kind: 'only', unitIds: [31, 32] }} onClose={onClose} />)
    expect(((await titleField()) as HTMLInputElement).value).toBe('poster 31')
    fireEvent.click(screen.getByRole('button', { name: 'Stash & next' }))
    await waitFor(async () =>
      expect(((await titleField()) as HTMLInputElement).value).toBe('poster 32')
    )
    fireEvent.click(screen.getByRole('button', { name: 'Stash' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(toasts.toast).toHaveBeenCalledWith('All tucked away · 2 mockups stashed', 'success')
    // poster 30 still waits, so the page that holds it stays.
    expect(useUiStore.getState().view).toBe('to-stash')
  })
})

describe('Look it over · an empty queue', () => {
  it('closes with a toast when nothing waits, and never throws', async () => {
    setup(queue([]))
    const onClose = vi.fn()
    render(<LookOverFlow open onClose={onClose} />)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(toasts.toast).toHaveBeenCalledWith({ message: 'Nothing left to look over' })
    expect(screen.queryByText('Something broke')).toBeNull()
  })

  it('closes the same way when none of the cards picked still wait', async () => {
    setup(queue([single(30)]))
    const onClose = vi.fn()
    render(<LookOverFlow open scope={{ kind: 'only', unitIds: [99] }} onClose={onClose} />)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})

describe('Look it over · a blank title on the way out', () => {
  it('Back takes the title it had back and moves', async () => {
    setup(queue([single(30), single(31)], { unitId: 31, mockupId: 31 }))
    render(<LookOverFlow open onClose={vi.fn()} />)
    fireEvent.change(await titleField(), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(async () =>
      expect(((await titleField()) as HTMLInputElement).value).toBe('poster 30')
    )
    expect(calls(IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT)).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Stash & next' }))
    await waitFor(async () =>
      expect(((await titleField()) as HTMLInputElement).value).toBe('poster 31')
    )
  })

  it('a rail step in a pile takes the base back and moves, saving the other edits', async () => {
    setup(queue([pileUnit]))
    render(<LookOverFlow open onClose={vi.fn()} />)
    fireEvent.change(await baseField(), { target: { value: '' } })
    fireEvent.change(screen.getByRole('textbox', { name: /description/i }), {
      target: { value: 'new words' }
    })
    const rail = screen.getByRole('navigation', { name: /PILE/ })
    fireEvent.click(within(rail).getByRole('button', { name: /look 11/ }))
    await waitFor(() =>
      expect(calls(IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT)).toEqual([
        expect.objectContaining({
          mockupId: 10,
          title: 'Apple Watch Ultra',
          description: 'new words'
        })
      ])
    )
    expect(((await baseField()) as HTMLInputElement).value).toBe('Apple Watch Ultra')
  })

  it('Finish later takes the title back and closes', async () => {
    setup(queue([single(30), single(31)]))
    const onClose = vi.fn()
    render(<LookOverFlow open onClose={onClose} />)
    fireEvent.change(await titleField(), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Finish later' }))
    const ask = await screen.findByRole('alertdialog')
    fireEvent.click(within(ask).getByRole('button', { name: 'Finish later' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calls(IPC_CHANNELS.LOOK_OVER_SET_RESUME)).toEqual([{ unitId: 30, mockupId: 30 }])
  })
})

describe('Look it over · the done toasts (inboxes.md, Done)', () => {
  it('Finish later after stashing some says how many skipped ones wait', async () => {
    setup(queue([single(30), single(31), single(32)]))
    const onClose = vi.fn()
    render(<LookOverFlow open onClose={onClose} />)
    await titleField()
    fireEvent.click(screen.getByRole('button', { name: 'Stash & next' }))
    await waitFor(async () =>
      expect(((await titleField()) as HTMLInputElement).value).toBe('poster 31')
    )
    fireEvent.click(screen.getByRole('button', { name: 'Finish later' }))
    const ask = await screen.findByRole('alertdialog')
    fireEvent.click(within(ask).getByRole('button', { name: 'Finish later' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(toasts.toast).toHaveBeenCalledWith(
      '1 tucked away · 2 skipped ones are waiting in To stash.',
      'success'
    )
  })
})

describe('Look it over · a top edit that reached its variants', () => {
  it('shows what main pushed for them without reopening the queue', async () => {
    setup(queue([pileUnit]), {
      [IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT]: () => {
        pushes.get(IPC_CHANNELS.LOOK_OVER_DRAFT)?.(
          item(11, 'variant', { description: 'carried words' })
        )
        return ok({ propagatedIds: [11] })
      }
    })
    render(<LookOverFlow open onClose={vi.fn()} />)
    fireEvent.change(await screen.findByRole('textbox', { name: /description/i }), {
      target: { value: 'carried words' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(
        (screen.getByRole('textbox', { name: /description/i }) as HTMLTextAreaElement).value
      ).toBe('carried words')
    )
    expect(calls(IPC_CHANNELS.LOOK_OVER_OPEN)).toHaveLength(1)
  })
})
