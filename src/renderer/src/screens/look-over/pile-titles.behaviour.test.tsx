import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import { LookOverFlow } from '@renderer/screens/look-over'

// Behaviour spec for pile titles in Look it over (design/specs/pile-titles.md, L8): the base and the variation.

const toasts = vi.hoisted(() => ({ toast: vi.fn(), undoToast: vi.fn() }))
vi.mock('@renderer/stores/toastStore', () => toasts)

const ok = (data: unknown) => ({ success: true, data })
const cover = { path: '/c.png', source: 'embedded', missing: false, width: 1600, height: 1200 }
const BASE = 'Clay iPhone 15 Pro'

const item = (
  id: number,
  role: string,
  words: string | null,
  over: Record<string, unknown> = {}
) => ({
  mockupId: id,
  pileId: role === 'single' ? null : 10,
  role,
  title: role === 'single' ? 'poster a3' : BASE,
  variation: words === null ? null : { words, source: 'ai' },
  description: 'Clay-style iPhone 15 Pro mockup.',
  tags: [],
  touched: false,
  checked: true,
  waitingForAi: false,
  carry: null,
  ai: { status: 'ready' },
  cover,
  ...over
})

const queue = (resumeAt = 11) => ({
  units: [
    {
      unitId: 10,
      kind: 'pile',
      items: [
        item(10, 'top', 'three-quarter'),
        item(11, 'variant', 'side'),
        item(12, 'variant', 'side 2', { variation: { words: 'side 2', source: 'ai' } }),
        item(13, 'variant', '02', { variation: { words: '02', source: 'marker' } })
      ]
    },
    { unitId: 30, kind: 'single', items: [item(30, 'single', null)] }
  ],
  checksEdits: false,
  resume: { unitId: 10, mockupId: resumeAt }
})

type Handler = (payload: unknown) => unknown
let invoke: ReturnType<typeof vi.fn>

function setup(overrides: Record<string, Handler> = {}) {
  const handlers: Record<string, Handler> = {
    [IPC_CHANNELS.LOOK_OVER_OPEN]: () => ok(queue()),
    [IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT]: () => ok({ propagatedIds: [] }),
    [IPC_CHANNELS.LOOK_OVER_SHOWING]: (p) =>
      ok({ mockupId: (p as { mockupId: number }).mockupId, status: 'ready' }),
    [IPC_CHANNELS.PILE_SET_VARIATION]: (p) =>
      ok({
        mockupId: (p as { mockupId: number }).mockupId,
        variation: { words: 'B', source: 'marker' },
        previous: { words: 'side', source: 'ai' }
      }),
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

const base = () => screen.getByRole('textbox', { name: 'Base title' }) as HTMLInputElement
const variation = () => screen.getByRole('textbox', { name: 'Variation' }) as HTMLInputElement
const rail = () => screen.getByRole('navigation', { name: /PILE/ })
const railSteps = () =>
  within(rail())
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label') ?? b.textContent)
const saves = () =>
  invoke.mock.calls
    .filter(([channel]) => channel === IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT)
    .map(([, p]) => p)

async function start() {
  render(<LookOverFlow open onClose={vi.fn()} />)
  await screen.findByRole('textbox', { name: /title/i })
}

beforeEach(() => setup())

describe('Look it over · pile titles (L8)', () => {
  it('a mockup in a pile shows its base and its variation under one Title, and the rail shows the variations', async () => {
    await start()
    expect(base().value).toBe(BASE)
    expect(variation().value).toBe('side')
    expect(within(rail()).getByText(BASE)).toBeTruthy()
    // L8.3 (a file marker) and L8.4 (a repeat the app numbered) read like any other variation.
    expect(railSteps()).toEqual([
      'Top · three-quarter',
      'Variant · side',
      'Variant · side 2',
      'Variant · 02',
      'Review & stash pile'
    ])
  })

  it('L8.1: renaming the base from any mockup says so, the rail header follows, and Next renames the pile', async () => {
    await start()
    fireEvent.focus(base())
    expect(screen.getByText('Renames the pile: all 4 mockups.')).toBeTruthy()
    fireEvent.change(base(), { target: { value: 'Matte clay iPhone 15 Pro' } })
    expect(within(rail()).getByText('Matte clay iPhone 15 Pro')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(saves()).toHaveLength(1))
    expect(saves()[0]).toMatchObject({
      mockupId: 11,
      title: 'Matte clay iPhone 15 Pro',
      variation: 'side'
    })
  })

  it('L8.2: changing the variation changes this mockup only, and its rail step follows', async () => {
    await start()
    fireEvent.change(variation(), { target: { value: 'side view' } })
    expect(railSteps()[1]).toBe('Variant · side view')
    expect(base().value).toBe(BASE)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(saves()).toHaveLength(1))
    expect(saves()[0]).toMatchObject({ mockupId: 11, title: BASE, variation: 'side view' })
  })

  it('L8.2: a variation left empty takes its file marker back when focus leaves', async () => {
    await start()
    fireEvent.change(variation(), { target: { value: '' } })
    expect(variation().getAttribute('placeholder')).toBe('1 to 3 words')
    fireEvent.blur(variation())
    await waitFor(() => expect(variation().value).toBe('B'))
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.PILE_SET_VARIATION, {
      mockupId: 11,
      words: ''
    })
  })

  it('the review cards are titled by their variations, with a capital', async () => {
    await start()
    fireEvent.click(within(rail()).getByRole('button', { name: 'Review & stash pile' }))
    await screen.findByRole('button', { name: 'Stash pile (4)' })
    for (const title of ['Three-quarter', 'Side', 'Side 2', '02']) {
      expect(screen.getByText(title, { selector: '[data-ds="MockupCard"] *' })).toBeTruthy()
    }
  })

  it('a mockup on its own keeps the single Title field', async () => {
    setup({
      [IPC_CHANNELS.LOOK_OVER_OPEN]: () =>
        ok({ ...queue(), units: [queue().units[1]], resume: null })
    })
    await start()
    expect(screen.queryByRole('textbox', { name: 'Variation' })).toBeNull()
    expect((screen.getByRole('textbox', { name: /Title/ }) as HTMLInputElement).value).toBe(
      'poster a3'
    )
  })
})
