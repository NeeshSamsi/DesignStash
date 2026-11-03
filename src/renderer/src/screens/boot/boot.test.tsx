import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import { installApi, ok } from '../onboarding/test-api'
import { BootGate } from './BootGate'

const toasts = vi.hoisted(() => ({ toast: vi.fn(), undoToast: vi.fn() }))
vi.mock('@renderer/stores/toastStore', () => toasts)

const launch = (
  state: string,
  extra: {
    onboarded?: boolean
    backupKept?: boolean
    handlers?: Record<string, (r: unknown) => unknown>
  } = {}
) =>
  installApi({
    [IPC_CHANNELS.BOOT_STATUS]: () => ok({ state, backupKept: extra.backupKept ?? false }),
    [IPC_CHANNELS.SETTINGS_GET]: () =>
      ok({
        libraryRoot: '/Volumes/Studio SSD/DesignStash',
        onboarded: extra.onboarded ?? true,
        telemetryEnabled: true
      }),
    ...extra.handlers
  })

const mount = () =>
  render(
    <BootGate>
      <p>the app</p>
    </BootGate>
  )

describe('launch', () => {
  it('waits with “Digging up your stash…” and a spinner, never a bare blank', () => {
    installApi({ [IPC_CHANNELS.BOOT_STATUS]: () => new Promise(() => {}) })
    mount()
    expect(screen.getByText('Digging up your stash…')).toBeTruthy()
    expect(screen.queryByText('the app')).toBeNull()
  })

  it('opens the app when launch is fine and onboarding is done', async () => {
    launch('ok')
    mount()
    expect(await screen.findByText('the app')).toBeTruthy()
  })

  it('starts onboarding on a first run', async () => {
    launch('ok', { onboarded: false })
    mount()
    expect(await screen.findByRole('heading', { name: 'Welcome to DesignStash' })).toBeTruthy()
    expect(screen.queryByText('the app')).toBeNull()
  })

  it('carries on if the status cannot be read', async () => {
    installApi({
      [IPC_CHANNELS.BOOT_STATUS]: () => ({ success: false, error: { code: 'X', message: 'x' } }),
      [IPC_CHANNELS.SETTINGS_GET]: () =>
        ok({ libraryRoot: '/x', onboarded: true, telemetryEnabled: true })
    })
    mount()
    expect(await screen.findByText('the app')).toBeTruthy()
  })
})

describe('a rejected invoke', () => {
  it('carries on instead of waiting on the launch screen forever', async () => {
    installApi({
      [IPC_CHANNELS.BOOT_STATUS]: () => ok({ state: 'library-failed', backupKept: false }),
      [IPC_CHANNELS.SETTINGS_GET]: () => Promise.reject(new Error('No handler registered'))
    })
    mount()
    expect(await screen.findByText('the app')).toBeTruthy()
    expect(screen.queryByText('Digging up your stash…')).toBeNull()
  })
})

describe('launch problems', () => {
  it('library-failed: says it plainly, keeps PSDs safe, offers Try again and Choose a folder', async () => {
    const api = launch('library-failed')
    mount()
    expect(await screen.findByText('We couldn’t open your stash')).toBeTruthy()
    expect(screen.getByText(/your PSDs are safe/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(api.sent(IPC_CHANNELS.APP_RELAUNCH)).toHaveLength(1))
  })

  it('shows no error codes and no paths', async () => {
    launch('library-failed')
    mount()
    await screen.findByText('We couldn’t open your stash')
    expect(document.body.textContent).not.toMatch(/SQLITE|LIBRARY_|ENOENT|\/Volumes|\.json/)
  })

  it('Copy report copies a scrubbed report and says so', async () => {
    const api = launch('library-failed', {
      handlers: { [IPC_CHANNELS.REPORT_COPY]: () => ok({ copied: true }) }
    })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Copy report' }))
    await waitFor(() => expect(api.sent(IPC_CHANNELS.REPORT_COPY)).toHaveLength(1))
    await waitFor(() =>
      expect(toasts.toast).toHaveBeenCalledWith({ variant: 'success', message: 'Report copied' })
    )
  })

  it('folder-unavailable: asks if the drive is plugged in, without naming the path', async () => {
    launch('folder-unavailable')
    mount()
    expect(await screen.findByText('We can’t find your stash folder')).toBeTruthy()
    expect(screen.getByText(/Is the drive plugged in\?/)).toBeTruthy()
    expect(document.body.textContent).not.toContain('Studio SSD')
  })

  it('Choose a folder picks one, saves it and restarts into it', async () => {
    const api = launch('folder-unavailable', {
      handlers: {
        [IPC_CHANNELS.DIALOG_SELECT_DIRECTORY]: () => ok({ path: '/Users/ada/Stash' }),
        [IPC_CHANNELS.SETTINGS_SET_LIBRARY_ROOT]: () => ok({ libraryRoot: '/Users/ada/Stash' })
      }
    })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Choose a folder' }))
    await waitFor(() => expect(api.sent(IPC_CHANNELS.APP_RELAUNCH)).toHaveLength(1))
    expect(api.sent(IPC_CHANNELS.SETTINGS_SET_LIBRARY_ROOT)).toEqual([{ path: '/Users/ada/Stash' }])
  })

  it('cancelling the folder picker does nothing', async () => {
    const api = launch('folder-unavailable', {
      handlers: { [IPC_CHANNELS.DIALOG_SELECT_DIRECTORY]: () => ok({ path: null }) }
    })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Choose a folder' }))
    await waitFor(() => expect(api.sent(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY)).toHaveLength(1))
    expect(api.sent(IPC_CHANNELS.APP_RELAUNCH)).toEqual([])
  })

  it('settings-corrupt: says they were reset and a copy was kept, then Continue starts setup', async () => {
    launch('settings-corrupt', { onboarded: false, backupKept: true })
    mount()
    expect(await screen.findByText('Let’s set things up again')).toBeTruthy()
    expect(screen.getByText('We reset your settings')).toBeTruthy()
    expect(screen.getByText(/We kept a copy of the old ones/)).toBeTruthy()
    expect(document.body.textContent).not.toContain('settings.json')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Welcome to DesignStash' })).toBeTruthy()
  })

  it('settings-corrupt without a backup does not claim one', async () => {
    launch('settings-corrupt', { onboarded: false, backupKept: false })
    mount()
    expect(await screen.findByText(/couldn’t keep a copy/)).toBeTruthy()
  })

  it('Skip for now goes straight to the app', async () => {
    launch('settings-corrupt', { onboarded: false })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Skip for now' }))
    expect(await screen.findByText('the app')).toBeTruthy()
  })
})
