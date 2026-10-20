import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import { LookOverFlow } from '@renderer/screens/look-over'
import { useUiStore } from '@renderer/stores/uiStore'

// Behaviour spec for piles in Look it over — see design/specs/piles.md. Run through the screen that owns the flow.

const toasts = vi.hoisted(() => ({ toast: vi.fn(), undoToast: vi.fn() }))
vi.mock('@renderer/stores/toastStore', () => toasts)

const ok = (data: unknown) => ({ success: true, data })

const cover = { path: '/c.png', source: 'embedded', missing: false, width: 1600, height: 1200 }
const item = (
  id: number,
  role: string,
  pileId: number | null,
  over: Record<string, unknown> = {}
) => ({
  mockupId: id,
  pileId,
  role,
  title: `Title ${id}`,
  description: `About ${id}`,
  tags: [],
  touched: false,
  checked: false,
  cover,
  sidecarFileName: null,
  ...over
})

const queueOf = (over: Record<string, unknown> = {}) => ({
  units: [
    {
      unitId: 10,
      kind: 'pile',
      items: [
        item(10, 'top', 10),
        item(11, 'variant', 10, { title: 'Title 10', description: 'About 10' }),
        item(12, 'variant', 10, { title: 'Title 10', description: 'About 10' })
      ]
    },
    { unitId: 20, kind: 'pile', items: [item(20, 'top', 20), item(21, 'variant', 20)] },
    { unitId: 30, kind: 'single', items: [item(30, 'single', null)] }
  ],
  resume: null,
  ...over
})

type Handler = (payload: unknown) => unknown
let invoke: ReturnType<typeof vi.fn>

function setup(overrides: Record<string, Handler> = {}, queue: unknown = queueOf()) {
  const handlers: Record<string, Handler> = {
    [IPC_CHANNELS.LOOK_OVER_OPEN]: () => ok(queue),
    [IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT]: () => ok({ propagatedIds: [] }),
    [IPC_CHANNELS.LOOK_OVER_SKIP]: () => ok({ skipped: true }),
    [IPC_CHANNELS.LOOK_OVER_SET_RESUME]: () => ok({ saved: true }),
    [IPC_CHANNELS.PILE_STASH]: (p) =>
      ok({
        ok: true,
        stashedIds: (p as { pileId: number }).pileId === 10 ? [10, 11, 12] : [20, 21],
        snapshot: { mockups: [], drafts: [], resume: null }
      }),
    [IPC_CHANNELS.MOCKUP_STASH]: () =>
      ok({ ok: true, stashedIds: [30], snapshot: { mockups: [], drafts: [], resume: null } }),
    [IPC_CHANNELS.PILE_UNSTASH]: () => ok({ restoredIds: [10, 11, 12] }),
    [IPC_CHANNELS.TAG_TREE]: () => ok({ tree: [] }),
    ...overrides
  }
  invoke = vi.fn(
    async (channel: string, payload: unknown) => handlers[channel]?.(payload) ?? ok({})
  )
  window.api = {
    appName: 'DesignStash',
    invoke,
    subscribe: vi.fn(() => () => {}),
    getPathForFile: vi.fn()
  } as unknown as typeof window.api
}

const calls = (channel: string) => invoke.mock.calls.filter(([name]) => name === channel)
const btn = (name: string | RegExp) => screen.getByRole('button', { name })
const maybe = (name: string | RegExp) => screen.queryByRole('button', { name })
const titleField = () => screen.getByRole('textbox', { name: /Title/ }) as HTMLInputElement

async function start(props: Partial<React.ComponentProps<typeof LookOverFlow>> = {}) {
  const onClose = vi.fn()
  const view = render(<LookOverFlow open onClose={onClose} {...props} />)
  await screen.findByRole('textbox', { name: /Title/ })
  return { ...view, onClose }
}
const rail = () => screen.getByRole('navigation', { name: /PILE/ })
const railLabels = () =>
  within(rail())
    .getAllByRole('button')
    .map((b) => b.textContent)
const badge = () =>
  document.querySelector('[data-ds="FlowModal"] li[aria-current="step"]')?.textContent ?? ''
const toReview = async () => {
  fireEvent.click(within(rail()).getByRole('button', { name: 'Review & stash pile' }))
  await screen.findByText(/Stash pile \(/)
}

beforeEach(() => {
  setup()
  toasts.toast.mockClear()
  toasts.undoToast.mockClear()
})

describe('Piles · drafts until Stash pile', () => {
  it('starts a pile on its top mockup and pre-fills variants from it', async () => {
    await start()
    expect(titleField().value).toBe('Title 10')
    fireEvent.click(btn('Next'))
    await waitFor(() => expect(badge()).toContain('Pile 1 of 2'))
    expect(titleField().value).toBe('Title 10')
    expect(
      (screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement).value
    ).toBe('About 10')
  })

  it('hugs its content, with a normal description box and no resize handle', async () => {
    await start()
    const modal = document.querySelector('[data-ds="FlowModal"]')!
    expect(modal.className).toContain('h-auto')
    expect(modal.className).not.toContain('h-flow-modal')
    const box = screen.getByRole('textbox', { name: 'Description' })
    expect(box.className).toContain('resize-none')
    expect(box.className).not.toContain('flex-1')
  })

  it('lists the pile in PileRail: top mockup, variants, then Review & stash pile', async () => {
    await start()
    expect(screen.getByText('PILE 1 OF 2')).not.toBeNull()
    expect(railLabels()).toEqual([
      'Top · Title 10',
      'Variant · Title 10',
      'Variant · Title 10',
      'Review & stash pile'
    ])
  })

  it('lets any step be opened from the rail (everything is a draft)', async () => {
    await start()
    fireEvent.click(within(rail()).getAllByRole('button')[2]!)
    await waitFor(() =>
      expect(within(rail()).getAllByRole('button')[2]!.getAttribute('aria-current')).toBe('step')
    )
    expect(titleField()).not.toBeNull()
  })

  it('moves on with Next and jumps to the end with Review pile', async () => {
    await start()
    fireEvent.click(btn('Next'))
    await waitFor(() =>
      expect(within(rail()).getAllByRole('button')[1]!.getAttribute('aria-current')).toBe('step')
    )
    await toReview()
    expect(badge()).toContain('Look it over')
    expect(document.body.textContent).toContain('Pile 1 of 2 · review')
  })

  it('updates untouched variants when the top mockup is edited, keeping edited ones', async () => {
    const fresh = queueOf()
    ;(fresh.units[0]!.items[1] as Record<string, unknown>).description = 'Brand new words'
    let opens = 0
    setup({
      [IPC_CHANNELS.LOOK_OVER_OPEN]: () => ok(++opens === 1 ? queueOf() : fresh),
      [IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT]: () => ok({ propagatedIds: [11] })
    })
    await start()
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
      target: { value: 'Brand new words' }
    })
    fireEvent.click(btn('Next'))
    await waitFor(() => expect(calls(IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT)).toHaveLength(1))
    await waitFor(() =>
      expect(
        (screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement).value
      ).toBe('Brand new words')
    )
    // Variant 12 was not in the propagated list: it keeps what it had.
    fireEvent.click(btn('Next'))
    await waitFor(() =>
      expect(
        (screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement).value
      ).toBe('About 10')
    )
  })

  it('marks a mockup jumped past without opening and shows it as Not checked at review', async () => {
    await start()
    await toReview()
    expect(screen.getAllByText('Not checked · pre-filled from the top mockup')).toHaveLength(2)
    const statuses = within(rail())
      .getAllByRole('button')
      .map((b) => b.getAttribute('data-status'))
    expect(statuses).toEqual(['done', 'skipped', 'skipped', 'current'])
  })

  it('has no Skip for now inside a pile (Skip is only for mockups on their own)', async () => {
    await start()
    expect(maybe('Skip for now')).toBeNull()
    fireEvent.click(btn('Next'))
    expect(maybe('Skip for now')).toBeNull()
  })

  it('goes Back to the previous draft inside a pile', async () => {
    await start()
    fireEvent.click(btn('Next'))
    await waitFor(() =>
      expect(within(rail()).getAllByRole('button')[1]!.getAttribute('aria-current')).toBe('step')
    )
    fireEvent.click(btn('Back'))
    await waitFor(() =>
      expect(within(rail()).getAllByRole('button')[0]!.getAttribute('aria-current')).toBe('step')
    )
  })

  it('goes Back from a pile’s top mockup into the previous pile’s review, marked stashed and editable', async () => {
    await start()
    await toReview()
    fireEvent.click(btn('Stash pile (3)'))
    await waitFor(() => expect(screen.getByText('PILE 2 OF 2')).not.toBeNull())
    fireEvent.click(btn('Back'))
    await waitFor(() => expect(document.body.textContent).toContain('Pile 1 of 2 · stashed'))
    // Open a card to edit it.
    fireEvent.click(within(rail()).getAllByRole('button')[0]!)
    expect(await screen.findByRole('textbox', { name: /Title/ })).not.toBeNull()
  })

  it('goes Back from the very first mockup to Sort only while nothing is stashed', async () => {
    const onBackToSort = vi.fn()
    await start({ onBackToSort })
    fireEvent.click(btn('Back'))
    expect(onBackToSort).toHaveBeenCalledOnce()

    await toReview()
    fireEvent.click(btn('Stash pile (3)'))
    await waitFor(() => expect(screen.getByText('PILE 2 OF 2')).not.toBeNull())
    fireEvent.click(btn('Back'))
    await waitFor(() => expect(document.body.textContent).toContain('stashed'))
    fireEvent.click(within(rail()).getAllByRole('button')[0]!)
    await screen.findByRole('textbox', { name: /Title/ })
    expect(maybe('Back')).toBeNull()
  })

  it('shows the deck with the number of mockups not yet looked at, and none on the last one', async () => {
    await start()
    expect(screen.getByText('2 left in this pile')).not.toBeNull()
    fireEvent.click(btn('Next'))
    await waitFor(() => expect(screen.getByText('1 left in this pile')).not.toBeNull())
    fireEvent.click(btn('Next'))
    await waitFor(() => expect(screen.queryByText(/left in this pile/)).toBeNull())
  })

  it('keeps the cover where it is on single-mockup screens', async () => {
    await start()
    await toReview()
    fireEvent.click(btn('Stash pile (3)'))
    await waitFor(() => expect(screen.getByText('PILE 2 OF 2')).not.toBeNull())
    await toReview()
    fireEvent.click(btn('Stash pile (2)'))
    await screen.findByRole('textbox', { name: /Title/ })
    expect(screen.queryByRole('navigation', { name: /PILE/ })).toBeNull()
    expect(document.querySelector('[data-ds="CoverPanel"]')).not.toBeNull()
    expect(document.querySelector('[data-deck]')).toBeNull()
  })

  it('shows Pile n of m in the header, then the haul count after the last pile', async () => {
    await start()
    expect(document.body.textContent).toContain('Pile 1 of 2')
    await toReview()
    fireEvent.click(btn('Stash pile (3)'))
    await waitFor(() => expect(document.body.textContent).toContain('Pile 2 of 2'))
    await toReview()
    fireEvent.click(btn('Stash pile (2)'))
    await waitFor(() => expect(document.body.textContent).toContain('6 of 6'))
  })

  it('lands on My Stash › All with the summary toast once everything is tucked away', async () => {
    useUiStore.getState().setView('to-stash')
    const { onClose } = await start()
    await toReview()
    fireEvent.click(btn('Stash pile (3)'))
    await waitFor(() => expect(document.body.textContent).toContain('Pile 2 of 2'))
    await toReview()
    fireEvent.click(btn('Stash pile (2)'))
    await waitFor(() => expect(document.body.textContent).toContain('6 of 6'))
    fireEvent.click(btn('Stash'))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(useUiStore.getState().view).toBe('all')
    expect(toasts.toast).toHaveBeenCalledWith('All tucked away · 6 mockups stashed', 'success')
  })

  it('reviews the pile as MockupCards and commits it all with Stash pile (N), undoable', async () => {
    await start()
    await toReview()
    expect(document.querySelectorAll('[data-ds="MockupCard"]')).toHaveLength(3)
    fireEvent.click(btn('Stash pile (3)'))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.PILE_STASH, { pileId: 10 })
    )
    await waitFor(() => expect(toasts.undoToast).toHaveBeenCalled())
    expect(toasts.undoToast.mock.calls[0]![0]).toBe('Pile stashed · 3 mockups')
    toasts.undoToast.mock.calls[0]![1]()
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.PILE_UNSTASH, {
        snapshot: { mockups: [], drafts: [], resume: null }
      })
    )
  })

  it('keeps the pile stashed and says so when Undo fails', async () => {
    setup({ [IPC_CHANNELS.PILE_UNSTASH]: () => ({ success: false, error: 'nope' }) })
    await start()
    await toReview()
    fireEvent.click(btn('Stash pile (3)'))
    await waitFor(() => expect(toasts.undoToast).toHaveBeenCalled())
    expect(calls(IPC_CHANNELS.LOOK_OVER_OPEN)).toHaveLength(1)
    toasts.undoToast.mock.calls[0]![1]()
    await waitFor(() =>
      expect(toasts.toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error', message: 'Couldn’t undo that' })
      )
    )
    expect(calls(IPC_CHANNELS.LOOK_OVER_OPEN)).toHaveLength(1)
    expect(document.body.textContent).toContain('Pile 2 of 2')
  })

  it('keeps all drafts and parks the pile in To stash on Finish later', async () => {
    const { onClose } = await start()
    fireEvent.change(titleField(), { target: { value: 'Edited top' } })
    fireEvent.click(btn('Finish later'))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Finish later?')).not.toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Finish later' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(calls(IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT)[0]![1]).toMatchObject({
      mockupId: 10,
      title: 'Edited top'
    })
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.LOOK_OVER_SET_RESUME, {
      unitId: 10,
      mockupId: 10
    })
  })
})

describe('Look it over · mockups on their own and the ends', () => {
  const singles = () => ({
    units: [
      { unitId: 30, kind: 'single', items: [item(30, 'single', null)] },
      { unitId: 31, kind: 'single', items: [item(31, 'single', null)] }
    ],
    resume: null
  })

  it('offers Skip for now on a mockup on its own, and sends it to the end', async () => {
    setup({}, singles())
    await start()
    fireEvent.click(btn('Skip for now'))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.LOOK_OVER_SKIP, { mockupId: 30 })
    )
    await waitFor(() => expect(titleField().value).toBe('Title 31'))
  })

  it('says where Skip sends it, and keeps only Back and the primary filled', async () => {
    setup({}, singles())
    await start()
    fireEvent.focus(btn('Skip for now'))
    expect((await screen.findAllByText('It stays in To stash')).length).toBeGreaterThan(0)
    expect(btn('Finish later').getAttribute('data-variant')).toBe('ghost')
    expect(btn('Skip for now').getAttribute('data-variant')).toBe('ghost')
  })

  it('stashes a single with Stash & next, and says all tucked away at the end', async () => {
    setup({}, singles())
    const { onClose } = await start()
    fireEvent.click(btn('Stash & next'))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.MOCKUP_STASH, { mockupId: 30 })
    )
    await screen.findByDisplayValue('Title 31')
    fireEvent.click(btn('Stash'))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(toasts.toast).toHaveBeenCalledWith('All tucked away · 2 mockups stashed', 'success')
  })

  it('resumes on the step Finish later left off', async () => {
    setup({}, queueOf({ resume: { unitId: 10, mockupId: 12 } }))
    await start()
    expect(within(rail()).getAllByRole('button')[2]!.getAttribute('aria-current')).toBe('step')
  })

  it('says why Stash pile was refused and goes to the mockup that is the reason', async () => {
    setup({
      [IPC_CHANNELS.PILE_STASH]: () => ok({ ok: false, reason: 'no-cover', mockupIds: [11] })
    })
    await start()
    await toReview()
    fireEvent.click(btn('Stash pile (3)'))
    await waitFor(() => expect(toasts.toast).toHaveBeenCalled())
    expect(toasts.toast.mock.calls[0]![0].message).toBe('Add a cover to stash it')
    await waitFor(() =>
      expect(within(rail()).getAllByRole('button')[1]!.getAttribute('aria-current')).toBe('step')
    )
  })

  it('shows an inline error with Retry when it cannot open', async () => {
    let tries = 0
    setup({
      [IPC_CHANNELS.LOOK_OVER_OPEN]: () => (++tries === 1 ? { success: false } : ok(queueOf()))
    })
    render(<LookOverFlow open onClose={() => {}} />)
    expect(await screen.findByText('We couldn’t open Look it over')).not.toBeNull()
    fireEvent.click(btn('Retry'))
    expect(await screen.findByRole('textbox', { name: /Title/ })).not.toBeNull()
  })
})
