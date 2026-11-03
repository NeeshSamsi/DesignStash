import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import { useInboxStore } from '@renderer/stores/inboxStore'
import { item } from '../library/library-test-utils'
import InboxPage from '../inboxes/InboxPage'
import TrashPage from '../trash/TrashPage'
import { installApi, ok } from '../onboarding/test-api'
import { CrashScreen } from './CrashScreen'
import { ErrorBoundary } from './ErrorBoundary'

const toasts = vi.hoisted(() => ({ toast: vi.fn(), undoToast: vi.fn() }))
vi.mock('@renderer/stores/toastStore', () => toasts)

beforeEach(() => {
  toasts.toast.mockClear()
  useInboxStore.getState().reset()
})

describe('X1 · crash screen', () => {
  it('says what happened in plain words, with no code or stack trace', () => {
    installApi()
    render(<CrashScreen />)
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Quit' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Copy report/ })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Error:|at \w+ \(|\/Users|0x|TypeError/)
  })

  it('Reload and Quit go through main', () => {
    const api = installApi()
    render(<CrashScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    fireEvent.click(screen.getByRole('button', { name: 'Quit' }))
    expect(api.sent(IPC_CHANNELS.APP_RELOAD)).toHaveLength(1)
    expect(api.sent(IPC_CHANNELS.APP_QUIT)).toHaveLength(1)
  })

  it('Copy report copies a scrubbed report and says so, never printing it', async () => {
    installApi({ [IPC_CHANNELS.REPORT_COPY]: () => ok({ copied: true }) })
    render(<CrashScreen />)
    fireEvent.click(screen.getByRole('button', { name: /Copy report/ }))
    await waitFor(() =>
      expect(toasts.toast).toHaveBeenCalledWith({ variant: 'success', message: 'Report copied' })
    )
  })

  it('takes over the window when something throws while rendering', () => {
    installApi()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Boom = () => {
      throw new Error('secret /Users/someone/file.psd')
    }
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(document.body.textContent).not.toContain('secret')
    log.mockRestore()
  })

  it('leaves a healthy window alone', () => {
    render(
      <ErrorBoundary>
        <p>the app</p>
      </ErrorBoundary>
    )
    expect(screen.getByText('the app')).toBeTruthy()
  })
})

describe('X2 · load failures', () => {
  afterEach(() => useInboxStore.getState().reset())

  it('a failed refresh on To sort keeps the cards and shows a Banner', async () => {
    installApi({
      [IPC_CHANNELS.INBOX_LIST]: () => ({ success: false, error: { code: 'X', message: 'x' } })
    })
    useInboxStore
      .getState()
      .setList('to_sort', [
        { ...item(1), stage: 'to_sort', aiStatus: 'ready', sizeBytes: 1, batchId: 'b' } as never
      ])
    render(<InboxPage stage="to_sort" />)
    expect(await screen.findByText('Couldn’t refresh this page')).toBeTruthy()
    expect(screen.getByText('Showing what was here a moment ago.')).toBeTruthy()
    expect(document.querySelector('[data-mockup-id="1"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('a failed first load on To stash shows the page error, not a Banner', async () => {
    installApi({
      [IPC_CHANNELS.INBOX_LIST]: () => ({ success: false, error: { code: 'X', message: 'x' } })
    })
    render(<InboxPage stage="to_stash" />)
    expect(await screen.findByText('Couldn’t load this page')).toBeTruthy()
    expect(screen.queryByText('Couldn’t refresh this page')).toBeNull()
  })

  it('a failed refresh on Trash keeps the cards and shows a Banner', async () => {
    installApi({
      [IPC_CHANNELS.TRASH_LIST]: () => ({ success: false, error: { code: 'X', message: 'x' } })
    })
    useInboxStore
      .getState()
      .setTrash([{ ...item(2), trashedAt: '2026-10-12T12:00:00Z', sizeBytes: 5 } as never])
    render(<TrashPage />)
    expect(await screen.findByText('Couldn’t refresh Trash')).toBeTruthy()
    expect(document.querySelector('[data-mockup-id="2"]')).not.toBeNull()
  })

  it('a failed first load on Trash shows the page error', async () => {
    installApi({
      [IPC_CHANNELS.TRASH_LIST]: () => ({ success: false, error: { code: 'X', message: 'x' } })
    })
    render(<TrashPage />)
    expect(await screen.findByText('Couldn’t load Trash')).toBeTruthy()
  })
})
