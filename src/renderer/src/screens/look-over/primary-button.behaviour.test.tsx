import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import { LookOverFlow } from '@renderer/screens/look-over'

// Behaviour spec for Look it over's primary button (design/specs/look-over.md): it says why only
// while it can't be pressed, and the reason it gives is the one holding it.

const toasts = vi.hoisted(() => ({ toast: vi.fn(), undoToast: vi.fn() }))
vi.mock('@renderer/stores/toastStore', () => toasts)

const ok = (data: unknown) => ({ success: true, data })
const cover = { path: '/c.png', source: 'embedded', missing: false, width: 1600, height: 1200 }
const noCover = { path: '', source: 'none', missing: false, width: null, height: null }

const item = (id: number, role: string, over: Record<string, unknown> = {}) => ({
  mockupId: id,
  pileId: role === 'single' ? null : 10,
  role,
  title: role === 'single' ? `poster ${id}` : 'Apple Watch Ultra',
  variation: role === 'single' ? null : { words: `look ${id}`, source: 'ai' },
  description: 'Apple Watch Ultra mockup.',
  tags: [],
  touched: false,
  checked: true,
  waitingForAi: false,
  carry: null,
  ai: { status: 'ready' },
  cover,
  ...over
})

const pile = (over: Record<number, Record<string, unknown>> = {}, resumeAt = 10) => ({
  units: [
    {
      unitId: 10,
      kind: 'pile',
      items: [item(10, 'top', over[10]), item(11, 'variant', over[11])]
    },
    { unitId: 30, kind: 'single', items: [item(30, 'single')] }
  ],
  checksEdits: false,
  resume: { unitId: 10, mockupId: resumeAt }
})

const singles = (first: Record<string, unknown> = {}) => ({
  units: [
    { unitId: 30, kind: 'single', items: [item(30, 'single', first)] },
    { unitId: 31, kind: 'single', items: [item(31, 'single')] }
  ],
  checksEdits: false,
  resume: null
})

type Handler = (payload: unknown) => unknown
let invoke: ReturnType<typeof vi.fn>

function setup(queue: unknown, overrides: Record<string, Handler> = {}) {
  const handlers: Record<string, Handler> = {
    [IPC_CHANNELS.LOOK_OVER_OPEN]: () => ok(queue),
    [IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT]: () => ok({ propagatedIds: [] }),
    [IPC_CHANNELS.LOOK_OVER_SHOWING]: (p) =>
      ok({ mockupId: (p as { mockupId: number }).mockupId, status: 'ready' }),
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

const rail = () => screen.getByRole('navigation', { name: /PILE/ })
const primary = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
/** The one tab stop that stands for the button: the wrapper while it's disabled, else itself. */
const tabStop = (button: HTMLButtonElement) =>
  button.disabled ? button.parentElement! : (button as HTMLElement)

/** What hovering, then focusing, the button shows: the tooltip's words, or null when none opens. */
async function tipOn(button: HTMLButtonElement, how: 'hover' | 'focus') {
  if (how === 'hover') fireEvent.pointerMove(button)
  else fireEvent.focus(tabStop(button))
  // Radix opens on the next tick, so give a tooltip the chance to appear before saying there's none.
  await new Promise((resolve) => setTimeout(resolve, 20))
  return screen.queryByRole('tooltip')?.textContent ?? null
}

async function start() {
  render(<LookOverFlow open onClose={vi.fn()} />)
  await screen.findByRole('textbox', { name: /title/i })
}

const toReview = async (count: number) => {
  fireEvent.click(within(rail()).getByRole('button', { name: 'Review & stash pile' }))
  return (await screen.findByRole('button', { name: `Stash pile (${count})` })) as HTMLButtonElement
}

beforeEach(() => toasts.toast.mockClear())

describe('Look it over · the primary button says why only while it is held', () => {
  it.each(['hover', 'focus'] as const)(
    'an enabled Stash pile shows no tooltip on %s, and has no wrapper to tab to',
    async (how) => {
      setup(pile())
      await start()
      const stash = await toReview(2)
      expect(stash.disabled).toBe(false)
      expect(await tipOn(stash, how)).toBeNull()
      expect(stash.closest('[tabindex="0"]')).toBeNull()
    }
  )

  it.each(['hover', 'focus'] as const)(
    'an enabled Stash & next shows no tooltip on %s',
    async (how) => {
      setup(singles())
      await start()
      const stash = primary('Stash & next')
      expect(stash.disabled).toBe(false)
      expect(await tipOn(stash, how)).toBeNull()
      expect(stash.closest('[tabindex="0"]')).toBeNull()
    }
  )

  it.each(['hover', 'focus'] as const)('an enabled Next shows no tooltip on %s', async (how) => {
    setup(pile())
    await start()
    const next = primary('Next')
    expect(next.disabled).toBe(false)
    expect(await tipOn(next, how)).toBeNull()
    expect(next.closest('[tabindex="0"]')).toBeNull()
  })

  it.each(['hover', 'focus'] as const)(
    'a pile mockup with no cover still goes on with Next, so %s shows nothing and nothing extra takes a tab',
    async (how) => {
      setup(pile({ 10: { cover: noCover } }))
      await start()
      const next = primary('Next')
      expect(next.disabled).toBe(false)
      expect(await tipOn(next, how)).toBeNull()
      expect(next.closest('[tabindex="0"]')).toBeNull()
    }
  )

  it.each(['hover', 'focus'] as const)(
    'a blank title holds Stash & next, and %s says to add one',
    async (how) => {
      setup(singles())
      await start()
      fireEvent.change(screen.getByRole('textbox', { name: /Title/ }), { target: { value: ' ' } })
      const stash = primary('Stash & next')
      expect(stash.disabled).toBe(true)
      expect(tabStop(stash).tabIndex).toBe(0)
      expect(await tipOn(stash, how)).toBe('Add a title to continue')
    }
  )

  it.each(['hover', 'focus'] as const)(
    'a mockup on its own with no cover holds Stash & next, and %s says to add one',
    async (how) => {
      setup(singles({ cover: noCover }))
      await start()
      const stash = primary('Stash & next')
      expect(stash.disabled).toBe(true)
      expect(tabStop(stash).tabIndex).toBe(0)
      expect(await tipOn(stash, how)).toBe('Add a cover to stash it')
    }
  )

  it.each(['hover', 'focus'] as const)(
    'a blank title holds Next in a pile too, and %s says to add one',
    async (how) => {
      setup(pile())
      await start()
      fireEvent.change(screen.getByRole('textbox', { name: 'Base title' }), {
        target: { value: '' }
      })
      const next = primary('Next')
      expect(next.disabled).toBe(true)
      expect(await tipOn(next, how)).toBe('Add a title to continue')
    }
  )

  it.each(['hover', 'focus'] as const)(
    'a mockup still writing holds Stash pile, and %s gives the wait',
    async (how) => {
      setup(pile({ 11: { waitingForAi: true, ai: { status: 'pending' } } }), {
        [IPC_CHANNELS.LOOK_OVER_SHOWING]: (p) => {
          const mockupId = (p as { mockupId: number }).mockupId
          return mockupId === 11
            ? ok({
                mockupId,
                status: 'sniffing',
                run: { phase: 'writing', writingSince: Date.now(), slowAfterMs: 20_000 }
              })
            : ok({ mockupId, status: 'ready' })
        }
      })
      await start()
      const stash = await toReview(2)
      await waitFor(() => expect(stash.disabled).toBe(true))
      expect(tabStop(stash).tabIndex).toBe(0)
      expect(await tipOn(stash, how)).toBe('Stash pile waits until Look 11’s suggestions arrive.')
    }
  )
})
