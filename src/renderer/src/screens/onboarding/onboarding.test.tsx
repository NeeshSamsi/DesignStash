import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AiModelInfo } from '@shared/ipc/ai'
import { OnboardingFlow, type OnboardingPage } from './OnboardingFlow'
import { installApi, ok } from './test-api'

const toasts = vi.hoisted(() => ({ toast: vi.fn(), undoToast: vi.fn() }))
vi.mock('@renderer/stores/toastStore', () => toasts)

const model = (id: string, over: Partial<AiModelInfo> = {}): AiModelInfo => ({
  id,
  name: `Model ${id}`,
  tier: 'medium',
  sizeBytes: 2_100_000_000,
  description: '',
  languages: [],
  quality: 3,
  speed: 3,
  minMemoryGB: 8,
  bestFit: id === 'a',
  downloadedBytes: 0,
  installed: false,
  active: false,
  ...over
})

const mac = {
  chip: 'Apple M2 Pro',
  totalMemoryGB: 32,
  isAppleSilicon: true,
  recommendedTier: 'medium'
}

const base = (extra: Record<string, (r: unknown) => unknown> = {}) => ({
  [IPC_CHANNELS.SETTINGS_GET]: () =>
    ok({
      libraryRoot: '/Users/ada/Pictures/DesignStash',
      onboarded: false,
      telemetryEnabled: true
    }),
  [IPC_CHANNELS.AI_HARDWARE_INFO]: () => ok(mac),
  [IPC_CHANNELS.AI_LIST_MODELS]: () => ok({ models: [model('a'), model('b')], legacy: [] }),
  ...extra
})

const mount = (start: OnboardingPage, onComplete = vi.fn()) => {
  render(<OnboardingFlow start={start} onComplete={onComplete} />)
  return onComplete
}
const btn = (name: string | RegExp) => screen.getByRole('button', { name })

describe('welcome and stash folder', () => {
  it('starts with the welcome in current words', () => {
    installApi(base())
    mount('welcome')
    expect(screen.getByRole('heading', { name: 'Welcome to DesignStash' })).toBeTruthy()
    expect(screen.getByText(/Everything stays on your Mac/)).toBeTruthy()
    fireEvent.click(btn('Get started'))
    expect(screen.getByRole('heading', { name: 'Where should your stash live?' })).toBeTruthy()
  })

  it('shows where the stash is now, in friendly words', async () => {
    installApi(base())
    mount('stash')
    expect(await screen.findByText('~/Pictures/DesignStash')).toBeTruthy()
    expect(screen.getByText('Macintosh HD › Users › you › Pictures')).toBeTruthy()
  })

  it('a folder that cannot be written to explains itself and blocks Continue', async () => {
    installApi(
      base({
        [IPC_CHANNELS.DIALOG_SELECT_DIRECTORY]: () => ok({ path: '/Users/ada/Locked' }),
        [IPC_CHANNELS.BOOT_CHECK_FOLDER]: () => ok({ state: 'not-writable', hasLibrary: false })
      })
    )
    mount('stash')
    await screen.findByText('~/Pictures/DesignStash')
    fireEvent.click(btn('Choose…'))
    expect(await screen.findByText(/We can’t stash anything in this folder/)).toBeTruthy()
    expect((btn('Continue') as HTMLButtonElement).disabled).toBe(true)
  })

  it('a folder that already holds a stash asks, and Use this stash lets you go on', async () => {
    const api = installApi(
      base({
        [IPC_CHANNELS.DIALOG_SELECT_DIRECTORY]: () => ok({ path: '/Users/ada/Old' }),
        [IPC_CHANNELS.BOOT_CHECK_FOLDER]: () => ok({ state: 'ok', hasLibrary: true }),
        [IPC_CHANNELS.SETTINGS_SET_LIBRARY_ROOT]: (r) =>
          ok({ libraryRoot: (r as { path: string }).path })
      })
    )
    mount('stash')
    await screen.findByText('~/Pictures/DesignStash')
    fireEvent.click(btn('Choose…'))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.textContent).toContain('already a stash here')
    expect(screen.queryByRole('button', { name: 'Start fresh' })).toBeNull()
    fireEvent.click(btn('Use this stash'))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    await waitFor(() =>
      expect(api.sent(IPC_CHANNELS.SETTINGS_SET_LIBRARY_ROOT)).toEqual([{ path: '/Users/ada/Old' }])
    )
    expect(await screen.findByRole('heading', { name: 'Set up on-device AI' })).toBeTruthy()
  })

  it('Choose another reopens the picker', async () => {
    const api = installApi(
      base({
        [IPC_CHANNELS.DIALOG_SELECT_DIRECTORY]: () => ok({ path: '/Users/ada/Old' }),
        [IPC_CHANNELS.BOOT_CHECK_FOLDER]: () => ok({ state: 'ok', hasLibrary: true })
      })
    )
    mount('stash')
    await screen.findByText('~/Pictures/DesignStash')
    fireEvent.click(btn('Choose…'))
    await screen.findByRole('alertdialog')
    fireEvent.click(btn('Choose another'))
    await waitFor(() => expect(api.sent(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY)).toHaveLength(2))
  })
})

describe('stash folder choice', () => {
  it('Choose another, then cancelling the picker, cannot leave the old stash proceedable', async () => {
    let picks = 0
    const api = installApi(
      base({
        [IPC_CHANNELS.DIALOG_SELECT_DIRECTORY]: () =>
          ok({ path: picks++ === 0 ? '/Users/ada/Old' : null }),
        [IPC_CHANNELS.BOOT_CHECK_FOLDER]: () => ok({ state: 'ok', hasLibrary: true }),
        [IPC_CHANNELS.SETTINGS_SET_LIBRARY_ROOT]: (r) =>
          ok({ libraryRoot: (r as { path: string }).path })
      })
    )
    mount('stash')
    await screen.findByText('~/Pictures/DesignStash')
    fireEvent.click(btn('Choose…'))
    await screen.findByRole('alertdialog')
    fireEvent.click(btn('Choose another'))
    await waitFor(() => expect(api.sent(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY)).toHaveLength(2))
    // The picker was cancelled: back to the folder that was chosen before, nothing unconfirmed.
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByText('~/Pictures/DesignStash')).toBeTruthy()
    fireEvent.click(btn('Continue'))
    await screen.findByRole('heading', { name: 'Set up on-device AI' })
    expect(api.sent(IPC_CHANNELS.SETTINGS_SET_LIBRARY_ROOT)).toHaveLength(0)
  })

  it('cuts a long path in the middle and keeps the whole one for the tooltip', async () => {
    installApi(
      base({
        [IPC_CHANNELS.SETTINGS_GET]: () =>
          ok({
            libraryRoot: '/Volumes/Studio SSD/Work/Clients/Acme/DesignStash',
            onboarded: false,
            telemetryEnabled: true
          })
      })
    )
    mount('stash')
    expect(await screen.findByText('Studio SSD/…/Acme/DesignStash')).toBeTruthy()
  })
})

describe('AI setup', () => {
  const lastRow = () => document.querySelectorAll('[data-ds="ModelRow"]')

  it('lists the catalogue with the best fit picked and recommended', async () => {
    installApi(base())
    mount('ai')
    expect(await screen.findByText('Model a')).toBeTruthy()
    expect(lastRow()).toHaveLength(2)
    expect(screen.getByText('Recommended')).toBeTruthy()
    expect(screen.getByText('Apple M2 Pro · 32 GB memory')).toBeTruthy()
    expect(screen.getByText('Use on-device AI')).toBeTruthy()
  })

  it('Download starts the picked model; progress, verifying and complete follow the push', async () => {
    const api = installApi(base({ [IPC_CHANNELS.AI_DOWNLOAD_MODEL]: () => ok({ started: true }) }))
    mount('ai')
    await screen.findByText('Model a')
    fireEvent.click(btn('Download'))
    await waitFor(() => expect(api.sent(IPC_CHANNELS.AI_DOWNLOAD_MODEL)).toEqual([{ id: 'a' }]))

    api.push(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, {
      modelId: 'a',
      receivedBytes: 860_000_000,
      totalBytes: 2_100_000_000,
      phase: 'downloading',
      bytesPerSecond: 18_000_000,
      secondsLeft: 70
    })
    expect(screen.getByText(/860 MB of 2.1 GB/)).toBeTruthy()
    expect(btn('Continue').hasAttribute('disabled')).toBe(false)
    expect(btn('Back')).toBeTruthy()

    api.push(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, {
      modelId: 'a',
      receivedBytes: 2_100_000_000,
      totalBytes: 2_100_000_000,
      phase: 'verifying'
    })
    expect(await screen.findByText('Checking the download…')).toBeTruthy()
    expect(btn('Continue').hasAttribute('disabled')).toBe(false)
  })

  it('Continue mid-download leaves it running, then switches the model on and says so', async () => {
    const api = installApi(base({ [IPC_CHANNELS.AI_DOWNLOAD_MODEL]: () => ok({ started: true }) }))
    mount('ai')
    await screen.findByText('Model a')
    fireEvent.click(btn('Download'))
    await waitFor(() => expect(api.sent(IPC_CHANNELS.AI_DOWNLOAD_MODEL)).toHaveLength(1))
    api.push(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, {
      modelId: 'a',
      receivedBytes: 860_000_000,
      totalBytes: 2_100_000_000,
      phase: 'downloading'
    })
    fireEvent.click(btn('Continue'))
    expect(await screen.findByText('Your privacy')).toBeTruthy()
    expect(api.sent(IPC_CHANNELS.AI_CANCEL_DOWNLOAD)).toHaveLength(0)

    api.push(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, {
      modelId: 'a',
      receivedBytes: 2_100_000_000,
      totalBytes: 2_100_000_000,
      phase: 'done'
    })
    await waitFor(() => expect(api.sent(IPC_CHANNELS.AI_SET_ACTIVE)).toEqual([{ id: 'a' }]))
    await waitFor(() =>
      expect(toasts.toast).toHaveBeenCalledWith({
        variant: 'success',
        message: 'Model a is ready and switched on'
      })
    )
  })

  it('complete says the model is on, and Continue switches it on for real', async () => {
    const api = installApi(
      base({
        [IPC_CHANNELS.AI_LIST_MODELS]: () =>
          ok({ models: [model('a', { installed: true }), model('b')], legacy: [] })
      })
    )
    mount('ai')
    expect(
      await screen.findByRole('heading', { name: 'Your AI model is ready to go' })
    ).toBeTruthy()
    fireEvent.click(btn('Continue'))
    await waitFor(() => expect(api.sent(IPC_CHANNELS.AI_SET_ACTIVE)).toEqual([{ id: 'a' }]))
    expect(await screen.findByRole('heading', { name: 'Your privacy' })).toBeTruthy()
  })

  it.each([
    ['offline', /Check your connection/],
    ['disk-full', /disk is full/],
    ['checksum', /came through damaged/],
    ['server', /isn’t responding/]
  ] as const)(
    'a %s failure says why in plain words and offers retry or skip',
    async (reason, copy) => {
      const api = installApi(base())
      mount('ai')
      await screen.findByText('Model a')
      api.push(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, {
        modelId: 'a',
        receivedBytes: 10,
        totalBytes: 100,
        phase: 'error',
        reason
      })
      expect(await screen.findByText(copy)).toBeTruthy()
      expect(btn('Retry download')).toBeTruthy()
      expect(btn('Skip AI')).toBeTruthy()
      expect(document.body.textContent).not.toMatch(/ENOSPC|ECONN|SQLITE/)
    }
  )

  it('a full disk also flags the Mac card', async () => {
    const api = installApi(base())
    mount('ai')
    await screen.findByText('Model a')
    api.push(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, {
      modelId: 'a',
      receivedBytes: 1,
      totalBytes: 2,
      phase: 'error',
      reason: 'disk-full'
    })
    expect(await screen.findByText('Low disk')).toBeTruthy()
  })

  it('turning the switch off collapses the models and the next step is Continue', async () => {
    installApi(base())
    mount('ai')
    await screen.findByText('Model a')
    fireEvent.click(screen.getByRole('switch', { name: 'Use on-device AI' }))
    expect(screen.queryByText('Model a')).toBeNull()
    expect(screen.getByText(/Titles will come from file names/)).toBeTruthy()
    fireEvent.click(btn('Continue'))
    expect(await screen.findByRole('heading', { name: 'Your privacy' })).toBeTruthy()
  })

  it('Skip AI goes on without a download', async () => {
    const api = installApi(base())
    mount('ai')
    await screen.findByText('Model a')
    fireEvent.click(btn('Skip AI'))
    expect(await screen.findByRole('heading', { name: 'Your privacy' })).toBeTruthy()
    expect(api.sent(IPC_CHANNELS.AI_DOWNLOAD_MODEL)).toEqual([])
  })

  it('on Intel it says so, offers no models and lets you continue', async () => {
    installApi(
      base({ [IPC_CHANNELS.AI_HARDWARE_INFO]: () => ok({ ...mac, isAppleSilicon: false }) })
    )
    mount('ai')
    expect(await screen.findByText('Not supported')).toBeTruthy()
    expect(screen.getByText(/Everything else works/)).toBeTruthy()
    fireEvent.click(btn('Continue'))
    expect(await screen.findByRole('heading', { name: 'Your privacy' })).toBeTruthy()
  })

  it('an empty catalogue offers Try again and Skip AI, and re-asks', async () => {
    const api = installApi(
      base({ [IPC_CHANNELS.AI_LIST_MODELS]: () => ok({ models: [], legacy: [] }) })
    )
    mount('ai')
    expect(await screen.findByText('We couldn’t load the model list')).toBeTruthy()
    const before = api.sent(IPC_CHANNELS.AI_LIST_MODELS).length
    fireEvent.click(btn('Try again'))
    await waitFor(() => expect(api.sent(IPC_CHANNELS.AI_LIST_MODELS).length).toBe(before + 1))
    expect(btn('Skip AI')).toBeTruthy()
  })

  it('a partial download asks whether to pick it up, and Resume carries on', async () => {
    const api = installApi(
      base({
        [IPC_CHANNELS.AI_LIST_MODELS]: () =>
          ok({
            models: [model('a', { downloadedBytes: 860_000_000 }), model('b')],
            legacy: []
          }),
        [IPC_CHANNELS.AI_DOWNLOAD_MODEL]: () => ok({ started: true })
      })
    )
    mount('ai')
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.textContent).toContain('Pick up where you left off?')
    expect(dialog.textContent).toContain('You got 860 MB of 2.1 GB before DesignStash closed.')
    fireEvent.click(btn('Resume'))
    await waitFor(() => expect(api.sent(IPC_CHANNELS.AI_DOWNLOAD_MODEL)).toEqual([{ id: 'a' }]))
  })

  it('Start over discards the partial download', async () => {
    const api = installApi(
      base({
        [IPC_CHANNELS.AI_LIST_MODELS]: () =>
          ok({ models: [model('a', { downloadedBytes: 5 }), model('b')], legacy: [] })
      })
    )
    mount('ai')
    await screen.findByRole('alertdialog')
    fireEvent.click(btn('Start over'))
    await waitFor(() => expect(api.sent(IPC_CHANNELS.AI_DELETE_MODEL)).toEqual([{ id: 'a' }]))
  })
})

describe('privacy and finish', () => {
  it('shows what is and is not collected, and No thanks records the choice', async () => {
    const api = installApi(base())
    mount('privacy')
    expect(screen.getByText('What we never collect')).toBeTruthy()
    fireEvent.click(btn('No thanks'))
    await waitFor(() =>
      expect(api.sent(IPC_CHANNELS.TELEMETRY_SET_CONSENT)).toEqual([{ enabled: false }])
    )
    expect(await screen.findByRole('heading', { name: 'Your stash is ready!' })).toBeTruthy()
  })

  it('Keep it on records the other choice', async () => {
    const api = installApi(base())
    mount('privacy')
    fireEvent.click(btn('Keep it on'))
    await waitFor(() =>
      expect(api.sent(IPC_CHANNELS.TELEMETRY_SET_CONSENT)).toEqual([{ enabled: true }])
    )
  })

  it('Open My Stash finishes onboarding', () => {
    installApi(base())
    const onComplete = mount('done')
    fireEvent.click(btn('Open My Stash'))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('Back goes to the privacy page', () => {
    installApi(base())
    mount('done')
    fireEvent.click(btn('Back'))
    expect(screen.getByRole('heading', { name: 'Your privacy' })).toBeTruthy()
  })

  it('walks all five pages with the progress marks following', async () => {
    installApi(base())
    mount('welcome')
    const step = () =>
      document.querySelector('[data-ds="StepIndicator"]')?.getAttribute('aria-valuenow')
    expect(step()).toBe('1')
    fireEvent.click(btn('Get started'))
    expect(step()).toBe('2')
    await screen.findByText('~/Pictures/DesignStash')
    fireEvent.click(btn('Continue'))
    expect(step()).toBe('3')
  })

  it('a different stash folder restarts the app into it at the end', async () => {
    const api = installApi(
      base({
        [IPC_CHANNELS.DIALOG_SELECT_DIRECTORY]: () => ok({ path: '/Users/ada/Elsewhere' }),
        [IPC_CHANNELS.BOOT_CHECK_FOLDER]: () => ok({ state: 'ok', hasLibrary: false }),
        [IPC_CHANNELS.SETTINGS_SET_LIBRARY_ROOT]: (r) =>
          ok({ libraryRoot: (r as { path: string }).path })
      })
    )
    const onComplete = mount('stash')
    await screen.findByText('~/Pictures/DesignStash')
    fireEvent.click(btn('Choose…'))
    await screen.findByText('~/Elsewhere')
    fireEvent.click(btn('Continue'))
    await screen.findByRole('heading', { name: 'Set up on-device AI' })
    fireEvent.click(await screen.findByRole('button', { name: 'Skip AI' }))
    fireEvent.click(await screen.findByRole('button', { name: 'No thanks' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open My Stash' }))
    await waitFor(() => expect(api.sent(IPC_CHANNELS.APP_RELAUNCH)).toHaveLength(1))
    expect(onComplete).not.toHaveBeenCalled()
  })
})
