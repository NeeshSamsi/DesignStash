import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import { LookOverFlow } from '@renderer/screens/look-over'

// The cover in Look it over when main keeps it (design/specs/cover.md; main's b4ac3c8).

const toasts = vi.hoisted(() => ({ toast: vi.fn(), undoToast: vi.fn() }))
vi.mock('@renderer/stores/toastStore', () => toasts)

const ok = (data: unknown) => ({ success: true, data })

const single = (source: string) => ({
  mockupId: 30,
  pileId: null,
  role: 'single',
  title: 'poster a3',
  variation: null,
  description: '',
  tags: [],
  touched: false,
  checked: true,
  waitingForAi: false,
  carry: null,
  ai: { status: 'ready' },
  cover: { path: '/c.png', source, missing: false, width: 1600, height: 1200 }
})

function setup(source: string, refusal: string) {
  const handlers: Record<string, () => unknown> = {
    [IPC_CHANNELS.LOOK_OVER_OPEN]: () =>
      ok({
        units: [{ unitId: 30, kind: 'single', items: [single(source)] }],
        checksEdits: false,
        resume: null
      }),
    [IPC_CHANNELS.LOOK_OVER_SHOWING]: () => ok({ mockupId: 30, status: 'ready' }),
    [IPC_CHANNELS.MOCKUP_USE_EMBEDDED_COVER]: () => ok({ ok: false, reason: refusal }),
    [IPC_CHANNELS.TAG_TREE]: () => ok({ tree: [] })
  }
  window.api = {
    appName: 'DesignStash',
    invoke: vi.fn(async (channel: string) => handlers[channel]?.() ?? ok({})),
    subscribe: vi.fn(() => () => {}),
    getPathForFile: vi.fn()
  } as unknown as typeof window.api
}

async function start() {
  render(<LookOverFlow open onClose={vi.fn()} />)
  await screen.findByRole('textbox', { name: /title/i })
}

describe('Look it over · the cover main keeps', () => {
  it('says why when main refuses the PSD’s own preview, and keeps the cover', async () => {
    setup('user-uploaded', 'no-embedded')
    await start()
    fireEvent.click(screen.getByRole('button', { name: 'Use the PSD’s preview' }))
    await waitFor(() =>
      expect(document.querySelector('[data-ds="Banner"]')?.textContent).toContain(
        'This PSD has no preview of its own, so this cover stays.'
      )
    )
    expect(document.querySelector('[data-ds="CoverPanel"] img')?.getAttribute('src')).toContain(
      'c.png'
    )
  })

  it('never offers the PSD’s preview on a sidecar cover', async () => {
    setup('sidecar', 'placeholder')
    await start()
    expect(screen.getByRole('button', { name: 'Replace' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Use the PSD’s preview' })).toBeNull()
  })
})
