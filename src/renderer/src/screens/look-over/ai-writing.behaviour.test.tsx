import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import { LookOverFlow } from '@renderer/screens/look-over'

// Behaviour spec for the AI writing in Look it over (design/specs/look-over.md, L6), through the screen.

const toasts = vi.hoisted(() => ({ toast: vi.fn(), undoToast: vi.fn() }))
vi.mock('@renderer/stores/toastStore', () => toasts)

const ok = (data: unknown) => ({ success: true, data })
const cover = { path: '/c.png', source: 'embedded', missing: false, width: 1600, height: 1200 }
const tag = { tagId: 7, label: 'Clay', categoryId: 2, categoryLabel: 'Style' }

const item = (id: number, role: string, over: Record<string, unknown> = {}) => ({
  mockupId: id,
  pileId: role === 'single' ? null : 10,
  role,
  title: `phone ${id}`,
  description: 'Clay-style iPhone 15 Pro mockup, three-quarter angle.',
  tags: [tag],
  touched: false,
  checked: false,
  waitingForAi: false,
  carry: null,
  // Where its suggestion is, as main reports it (ignored by schemas that don't have it yet).
  ai: { status: over.waitingForAi ? 'pending' : 'ready' },
  cover,
  ...over
})

const pileQueue = (resumeAt = 11) => ({
  units: [
    {
      unitId: 10,
      kind: 'pile',
      items: [
        item(10, 'top', { title: 'Clay iPhone 15 Pro', checked: true }),
        item(11, 'variant', { title: 'phone side', waitingForAi: true }),
        item(12, 'variant', { title: 'phone back', waitingForAi: true })
      ]
    }
  ],
  resume: { unitId: 10, mockupId: resumeAt }
})

const writing = (mockupId: number, since = Date.now()) => ({
  mockupId,
  status: 'sniffing',
  run: { phase: 'writing', writingSince: since, slowAfterMs: 20_000 }
})

type Handler = (payload: unknown) => unknown
let invoke: ReturnType<typeof vi.fn>
let listeners: Record<string, (payload: unknown) => void>

function setup(overrides: Record<string, Handler> = {}, queue: unknown = pileQueue()) {
  const handlers: Record<string, Handler> = {
    [IPC_CHANNELS.LOOK_OVER_OPEN]: () => ok(queue),
    [IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT]: () => ok({ propagatedIds: [] }),
    [IPC_CHANNELS.LOOK_OVER_SHOWING]: (p) => ok(writing((p as { mockupId: number }).mockupId)),
    [IPC_CHANNELS.LOOK_OVER_FILL_MYSELF]: () => ok(null),
    [IPC_CHANNELS.LOOK_OVER_WRITE]: () => ok(null),
    [IPC_CHANNELS.TAG_TREE]: () => ok({ tree: [] }),
    ...overrides
  }
  invoke = vi.fn(
    async (channel: string, payload: unknown) => handlers[channel]?.(payload) ?? ok({})
  )
  listeners = {}
  window.api = {
    appName: 'DesignStash',
    invoke,
    subscribe: vi.fn((channel: string, cb: (payload: unknown) => void) => {
      listeners[channel] = cb
      return () => {}
    }),
    getPathForFile: vi.fn()
  } as unknown as typeof window.api
}

const push = (channel: string, payload: unknown) => act(() => listeners[channel]?.(payload))
const titleField = () => screen.getByRole('textbox', { name: /Title/ }) as HTMLInputElement
const description = () =>
  screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement
const line = () => document.querySelector('[data-ds="AiStatus"]')
const rail = () => screen.getByRole('navigation', { name: /PILE/ })

async function start() {
  render(<LookOverFlow open onClose={vi.fn()} />)
  await screen.findByRole('textbox', { name: /Title/ })
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.LOOK_OVER_SHOWING, expect.anything())
  )
}

beforeEach(() => setup())

describe('Look it over · AI writing (L6)', () => {
  it('L6.1: opens on “Writing with AI…” with Fill it myself, and every field stays typeable', async () => {
    await start()
    expect(line()?.textContent).toContain('Writing with AI…')
    expect(
      within(line() as HTMLElement).getByRole('button', { name: 'Fill it myself' })
    ).toBeTruthy()
    for (const field of [titleField(), description()]) {
      expect(field.value).toBe('')
      expect(field.getAttribute('placeholder')).toBe('Writing with AI…')
      expect(field.readOnly).toBe(false)
    }
    expect(document.querySelectorAll('[data-ds="TagChip"][data-state="thinking"]')).toHaveLength(1)
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.LOOK_OVER_SHOWING, { mockupId: 11 })
  })

  it('the rail is right from the first frame, from each item’s own AI state', async () => {
    setup(
      {},
      {
        ...pileQueue(10),
        units: [
          {
            unitId: 10,
            kind: 'pile',
            items: [
              item(10, 'top', { title: 'Clay iPhone 15 Pro' }),
              item(11, 'variant', { waitingForAi: true, ai: writing(11) }),
              item(12, 'variant', { waitingForAi: true })
            ]
          }
        ]
      }
    )
    await start()
    expect(within(rail()).getByText('Writing with AI…')).toBeTruthy()
    expect(within(rail()).getByText('Suggestions on the way')).toBeTruthy()
  })

  it('the rail follows ai:status: which one is being written and which are on the way', async () => {
    await start()
    push(IPC_CHANNELS.AI_STATUS, {
      updates: [writing(11), { mockupId: 12, status: 'pending' }],
      totals: { total: 2, remaining: 2 }
    })
    expect(
      within(rail())
        .getByRole('button', { name: /phone side/ })
        .getAttribute('aria-describedby')
    ).toBeTruthy()
    expect(within(rail()).getByText('Writing with AI…')).toBeTruthy()
    expect(within(rail()).getByText('Suggestions on the way')).toBeTruthy()
  })

  it('L6.2: typing in a field makes it yours, and the line says what is still coming', async () => {
    await start()
    fireEvent.change(titleField(), { target: { value: 'Side' } })
    expect(titleField().value).toBe('Side')
    expect(titleField().getAttribute('placeholder')).not.toBe('Writing with AI…')
    expect(description().getAttribute('placeholder')).toBe('Writing with AI…')
    expect(line()?.textContent).toContain(
      'Writing the description and tags with AI. Your title stays as you typed it.'
    )
  })

  it('L6.3: the suggestion fills the untouched fields, tinted, and the line says what it filled', async () => {
    await start()
    fireEvent.change(titleField(), { target: { value: 'Side' } })
    push(IPC_CHANNELS.LOOK_OVER_DRAFT, {
      ...item(11, 'variant', {
        title: 'Clay iPhone 15 Pro side',
        description: 'Seen from the side.'
      }),
      waitingForAi: false
    })
    expect(titleField().value).toBe('Side')
    expect(description().value).toBe('Seen from the side.')
    expect(description().getAttribute('data-state')).toBe('ai-filled')
    expect(line()?.textContent).toContain(
      'AI filled in the description and tags. Your title stays as you typed it.'
    )
  })

  it('L6.4: says it is taking a while once the run counts as slow', async () => {
    setup({
      [IPC_CHANNELS.LOOK_OVER_SHOWING]: (p) =>
        ok(writing((p as { mockupId: number }).mockupId, Date.now() - 25_000))
    })
    await start()
    await waitFor(() =>
      expect(line()?.textContent).toContain('Still writing with AI. This one is taking a while.')
    )
    expect(screen.getByRole('button', { name: 'Fill it myself' })).toBeTruthy()
  })

  it('L6.E1: Fill it myself starts the title from the file name, selected, and empties the rest', async () => {
    await start()
    fireEvent.click(screen.getByRole('button', { name: 'Fill it myself' }))
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.LOOK_OVER_FILL_MYSELF, { mockupId: 11 })
    expect(line()?.textContent).toContain(
      'You’re filling this one in. Its title starts from the file name.'
    )
    expect(titleField().value).toBe('phone side')
    await waitFor(() => expect(document.activeElement).toBe(titleField()))
    expect([titleField().selectionStart, titleField().selectionEnd]).toEqual([
      0,
      'phone side'.length
    ])
    expect(description().value).toBe('')
    expect(document.querySelectorAll('[data-state="thinking"]')).toHaveLength(0)
    // A late suggestion leaves it alone.
    push(IPC_CHANNELS.LOOK_OVER_DRAFT, {
      ...item(11, 'variant', { title: 'AI title' }),
      waitingForAi: false
    })
    expect(titleField().value).toBe('phone side')
    expect(description().value).toBe('')
  })

  it('L6.E1: Write suggestions asks again, and the fields the person didn’t type in write again', async () => {
    setup({
      [IPC_CHANNELS.LOOK_OVER_FILL_MYSELF]: () =>
        ok(item(11, 'variant', { title: 'phone side', ai: { status: 'opted_out' } })),
      [IPC_CHANNELS.LOOK_OVER_WRITE]: () =>
        ok(
          item(11, 'variant', {
            title: 'phone side',
            waitingForAi: true,
            ai: { status: 'pending' }
          })
        )
    })
    await start()
    fireEvent.click(screen.getByRole('button', { name: 'Fill it myself' }))
    fireEvent.change(titleField(), { target: { value: 'Side' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Write suggestions' }))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.LOOK_OVER_WRITE, { mockupId: 11 })
    )
    await waitFor(() => expect(description().getAttribute('placeholder')).toBe('Writing with AI…'))
    expect(titleField().value).toBe('Side')
    expect(line()?.textContent).toContain('Writing the description and tags with AI.')
  })

  it('L6.E3: says plainly that it couldn’t write, and where the title came from', async () => {
    setup(
      {
        [IPC_CHANNELS.LOOK_OVER_SHOWING]: (p) =>
          ok({ mockupId: (p as { mockupId: number }).mockupId, status: 'failed' })
      },
      {
        units: [
          {
            unitId: 30,
            kind: 'single',
            items: [item(30, 'single', { title: 'poster a3', ai: { status: 'failed' } })]
          }
        ],
        resume: null
      }
    )
    await start()
    await waitFor(() =>
      expect(line()?.textContent).toContain(
        'Couldn’t write suggestions for this one, so the title is its file name.'
      )
    )
    expect(document.querySelector('[data-ds="AiStatus"][data-kind="failed"]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.LOOK_OVER_WRITE, { mockupId: 30 })
    )
  })

  it('the hard stop ends the run as couldn’t write, in the row it already has', async () => {
    await start()
    push(IPC_CHANNELS.AI_STATUS, {
      updates: [{ mockupId: 11, status: 'failed' }],
      totals: { total: 2, remaining: 1 }
    })
    push(
      IPC_CHANNELS.LOOK_OVER_DRAFT,
      item(11, 'variant', { title: 'phone side', ai: { status: 'failed' } })
    )
    expect(line()?.textContent).toContain(
      'Couldn’t write suggestions for this one, so the title is its file name.'
    )
    expect(titleField().value).toBe('phone side')
  })

  it('shows no line when AI is off, or when the suggestion was already in', async () => {
    setup(
      {
        [IPC_CHANNELS.LOOK_OVER_SHOWING]: (p) =>
          ok({ mockupId: (p as { mockupId: number }).mockupId, status: 'off' })
      },
      {
        units: [{ unitId: 30, kind: 'single', items: [item(30, 'single')] }],
        resume: null
      }
    )
    await start()
    expect(line()).toBeNull()
  })

  it('L6.5: a mockup on its own that is still waiting opens on the same writing state', async () => {
    setup(
      {},
      {
        units: [
          { unitId: 30, kind: 'single', items: [item(30, 'single', { waitingForAi: true })] }
        ],
        resume: null
      }
    )
    await start()
    expect(line()?.textContent).toContain('Writing with AI…')
    expect(titleField().getAttribute('placeholder')).toBe('Writing with AI…')
  })

  it('L6.E4: Stash pile waits for the one still writing, which offers Fill it myself under its card', async () => {
    setup({}, pileQueue(10))
    await start()
    fireEvent.click(within(rail()).getByRole('button', { name: 'Review & stash pile' }))
    const stash = await screen.findByRole('button', { name: 'Stash pile (3)' })
    expect((stash as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Stash pile waits until 2 mockups’ suggestions arrive.')).toBeTruthy()
    const fills = screen.getAllByRole('button', { name: 'Fill it myself' })
    expect(fills).toHaveLength(2)
    fireEvent.click(fills[0]!)
    expect(screen.getByText('Stash pile waits until phone back’s suggestions arrive.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Fill it myself' }))
    expect(
      (screen.getByRole('button', { name: 'Stash pile (3)' }) as HTMLButtonElement).disabled
    ).toBe(false)
    expect(screen.queryByText(/Stash pile waits/)).toBeNull()
  })
})
