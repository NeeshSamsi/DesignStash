import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import { LookOverFlow } from '@renderer/screens/look-over'

// Behaviour spec for the edit check and the offer in Look it over (design/specs/look-over.md, L7).

const toasts = vi.hoisted(() => ({ toast: vi.fn(), undoToast: vi.fn() }))
vi.mock('@renderer/stores/toastStore', () => toasts)

const ok = (data: unknown) => ({ success: true, data })
const cover = { path: '/c.png', source: 'embedded', missing: false, width: 1600, height: 1200 }
const terracotta = { tagId: 5, label: 'Terracotta', categoryId: 3, categoryLabel: 'Colour' }
const studio = { tagId: 6, label: 'Studio', categoryId: 4, categoryLabel: 'Scene' }
const OWN = 'Clay-style iPhone 15 Pro mockup on a warm beige backdrop, seen from the side.'
const REWRITE = 'Clay-style iPhone 15 Pro mockup on a terracotta backdrop, seen from the side.'

const carry = (over: Record<string, unknown> = {}) => ({
  state: 'offered',
  reason: null,
  why: 'unjudged',
  after: { description: REWRITE, via: 'rewrite' },
  tagsAdded: [terracotta],
  tagsRemoved: [studio],
  ...over
})

const item = (id: number, role: string, over: Record<string, unknown> = {}) => ({
  mockupId: id,
  pileId: 10,
  role,
  title: `phone ${id}`,
  description: OWN,
  tags: [studio],
  touched: false,
  checked: role === 'top',
  waitingForAi: false,
  carry: null,
  ai: { status: 'ready' },
  cover,
  ...over
})

const queueWith = (variant: Record<string, unknown>, resumeAt = 11, checksEdits = false) => ({
  units: [
    {
      unitId: 10,
      kind: 'pile',
      items: [
        item(10, 'top', { title: 'Clay iPhone 15 Pro' }),
        item(11, 'variant', variant),
        item(12, 'variant')
      ]
    }
  ],
  checksEdits,
  resume: { unitId: 10, mockupId: resumeAt }
})

type Handler = (payload: unknown) => unknown
let invoke: ReturnType<typeof vi.fn>

function setup(queue: unknown, overrides: Record<string, Handler> = {}) {
  const handlers: Record<string, Handler> = {
    [IPC_CHANNELS.LOOK_OVER_OPEN]: () => ok(queue),
    [IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT]: () => ok({ propagatedIds: [] }),
    [IPC_CHANNELS.LOOK_OVER_SHOWING]: (p) =>
      ok({ mockupId: (p as { mockupId: number }).mockupId, status: 'ready' }),
    [IPC_CHANNELS.LOOK_OVER_ANSWER_EDIT]: () => ok(null),
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

const line = () => document.querySelector('[data-ds="AiStatus"]') as HTMLElement | null
const description = () =>
  screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement
const rail = () => screen.getByRole('navigation', { name: /PILE/ })
const preview = () => document.querySelector('[data-ds="Popover"]') as HTMLElement | null
const answered = (action: string) =>
  invoke.mock.calls.some(
    ([channel, payload]) =>
      channel === IPC_CHANNELS.LOOK_OVER_ANSWER_EDIT &&
      (payload as { action: string }).action === action
  )

async function start() {
  render(<LookOverFlow open onClose={vi.fn()} />)
  await screen.findByRole('textbox', { name: /Title/ })
}

beforeEach(() => toasts.toast.mockClear())

describe('Look it over · the edit to the top (L7)', () => {
  it('L7.1: the top keeps an empty row, then says what Next will do once its words change', async () => {
    setup(queueWith({}, 10, true))
    await start()
    expect(line()?.getAttribute('data-kind')).toBe('none')
    fireEvent.change(description(), {
      target: { value: 'Clay-style iPhone 15 Pro on terracotta.' }
    })
    expect(line()?.textContent).toContain(
      'When you go on, your edits get checked against the 2 variants.'
    )
  })

  it('L7.1 with a model that doesn’t check: the edits are offered', async () => {
    setup(queueWith({}, 10, false))
    await start()
    fireEvent.change(description(), { target: { value: 'On terracotta.' } })
    expect(line()?.textContent).toContain(
      'When you go on, your edits are offered on the 2 variants.'
    )
  })

  it('L7.2: a variant being checked says so, and so does its rail step', async () => {
    setup(queueWith({ carry: carry({ state: 'checking', why: null, after: null }) }))
    await start()
    expect(line()?.textContent).toContain(
      'Checking how your edits to the top mockup fit the variant…'
    )
    expect(within(rail()).getByText('Checking your edits…')).toBeTruthy()
  })

  it('L7.9: the offer, with Apply here and ×, and a preview that opens on focus and closes on Esc', async () => {
    setup(queueWith({ carry: carry() }))
    await start()
    expect(line()?.textContent).toContain('Use your top mockup edits here too?')
    expect(within(rail()).getByText('Edits offered')).toBeTruthy()
    const apply = within(line()!).getByRole('button', { name: 'Apply here' })
    expect(within(line()!).getByRole('button', { name: 'Dismiss' })).toBeTruthy()

    fireEvent.focus(apply)
    const panel = await waitFor(() => {
      expect(preview()).not.toBeNull()
      return preview()!
    })
    expect(within(panel).getByText('Your top mockup edits')).toBeTruthy()
    expect(
      within(panel).getByText('Not checked for this variant, so look before you apply.')
    ).toBeTruthy()
    expect(panel.querySelector('del')?.textContent?.trim()).toBe('warm beige')
    expect(panel.querySelector('ins')?.textContent?.trim()).toBe('terracotta')
    expect(within(panel).getByText('Adds')).toBeTruthy()
    expect(within(panel).getByText('Removes')).toBeTruthy()
    expect(
      [...panel.querySelectorAll('[data-slot="popover-footer"] button')].map((b) => b.textContent)
    ).toEqual(['Close', 'Apply here'])

    // Tab goes from the button into the footer.
    fireEvent.keyDown(apply, { key: 'Tab' })
    expect(document.activeElement?.textContent).toBe('Close')
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    await waitFor(() => expect(preview()).toBeNull())
  })

  it('L7.9: hovering the button for 300 ms opens the preview', async () => {
    setup(queueWith({ carry: carry() }))
    await start()
    fireEvent.pointerEnter(within(line()!).getByRole('button', { name: 'Apply here' }))
    expect(preview()).toBeNull()
    await waitFor(() => expect(preview()).not.toBeNull(), { timeout: 1000 })
  })

  it('L7.8 then L7.E3: Apply here takes the edit, tinted, with Undo; Undo puts its own words back', async () => {
    setup(queueWith({ carry: carry() }), {
      [IPC_CHANNELS.LOOK_OVER_ANSWER_EDIT]: (p) =>
        (p as { action: string }).action === 'accept'
          ? ok(
              item(11, 'variant', {
                description: REWRITE,
                tags: [terracotta],
                carry: carry({ state: 'applied', why: null })
              })
            )
          : ok(item(11, 'variant', { carry: carry({ why: 'undone' }) }))
    })
    await start()
    fireEvent.click(within(line()!).getByRole('button', { name: 'Apply here' }))
    await waitFor(() => expect(description().value).toBe(REWRITE))
    expect(answered('accept')).toBe(true)
    expect(description().getAttribute('data-state')).toBe('ai-filled')
    expect(line()?.textContent).toContain('Applied your top mockup edits to this one.')
    expect(within(rail()).getByText('Edits applied')).toBeTruthy()

    fireEvent.click(within(line()!).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(description().value).toBe(OWN))
    expect(line()?.textContent).toContain(
      'Back to this one’s own words. Your top mockup edits stay on offer.'
    )
  })

  it('L7.10: × dismisses for this variant, the row stays empty, and ⌘Z brings the offer back', async () => {
    setup(queueWith({ carry: carry() }), {
      [IPC_CHANNELS.LOOK_OVER_ANSWER_EDIT]: (p) =>
        ok(
          item(11, 'variant', {
            carry: carry({
              state: (p as { action: string }).action === 'dismiss' ? 'dismissed' : 'offered'
            })
          })
        )
    })
    await start()
    fireEvent.click(within(line()!).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(line()?.getAttribute('data-kind')).toBe('none'))
    expect(within(rail()).queryByText('Edits offered')).toBeNull()

    // ⌘Z in a text field is the field's own undo.
    fireEvent.keyDown(description(), { key: 'z', metaKey: true })
    expect(answered('restore')).toBe(false)
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() =>
      expect(line()?.textContent).toContain('Use your top mockup edits here too?')
    )
  })

  it('L7.7: the model left it out, so the preview gives its reason and the button says Apply anyway', async () => {
    setup(
      queueWith({ carry: carry({ why: 'refused', reason: 'this one is on a white backdrop' }) }),
      {}
    )
    await start()
    expect(line()?.textContent).toContain('Left out your top mockup edits.')
    fireEvent.focus(within(line()!).getByRole('button', { name: 'Apply anyway' }))
    await waitFor(() => expect(preview()).not.toBeNull())
    expect(within(preview()!).getByText('This one is on a white backdrop.')).toBeTruthy()
  })

  it('L7.12: the preview prepares the version, with the tag changes already there', async () => {
    setup(queueWith({ carry: carry({ after: null }) }))
    await start()
    fireEvent.focus(within(line()!).getByRole('button', { name: 'Apply here' }))
    await waitFor(() => expect(preview()).not.toBeNull())
    expect(within(preview()!).getByText('Preparing this one’s version…')).toBeTruthy()
    expect(within(preview()!).getByText('Adds')).toBeTruthy()
  })

  it('L7.6 and L7.11: each review card gives the result, or how to answer the offer', async () => {
    setup({
      units: [
        {
          unitId: 10,
          kind: 'pile',
          items: [
            item(10, 'top', { title: 'Three-quarter' }),
            item(11, 'variant', {
              title: 'Side',
              checked: true,
              carry: carry({ state: 'applied', why: null })
            }),
            item(12, 'variant', {
              title: 'Back',
              checked: true,
              carry: carry({ state: 'reworded', why: null })
            }),
            item(13, 'variant', { title: 'Above', checked: true, carry: carry() }),
            item(14, 'variant', {
              title: 'Front',
              checked: true,
              carry: carry({ state: 'dismissed' })
            })
          ]
        }
      ],
      checksEdits: false,
      resume: { unitId: 10, mockupId: 10 }
    })
    await start()
    fireEvent.click(within(rail()).getByRole('button', { name: 'Review & stash pile' }))
    await screen.findByRole('button', { name: 'Stash pile (5)' })
    expect(screen.getByText('Edits applied', { selector: '[data-ds="MockupCard"] *' })).toBeTruthy()
    expect(screen.getByText('Edits reworded for this one')).toBeTruthy()
    expect(screen.getByText('Edits offered: open it to apply')).toBeTruthy()
    // A dismissed offer: the card shows its own tags, and Stash pile isn't held up by any offer.
    expect(screen.getAllByText('Studio').length).toBeGreaterThan(0)
    expect(
      (screen.getByRole('button', { name: 'Stash pile (5)' }) as HTMLButtonElement).disabled
    ).toBe(false)
  })
})
