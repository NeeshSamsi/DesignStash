import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import { SettingsModal } from './SettingsModal'
import { useUiStore } from '../../stores/uiStore'

// Behaviour spec for Settings — see design/specs/settings.md.

const toasts = vi.hoisted(() => ({ toast: vi.fn(), undoToast: vi.fn() }))
vi.mock('@renderer/stores/toastStore', () => toasts)
vi.mock('../../stores/toastStore', () => toasts)

// The tag tree has its own tests; here it is a stand-in that exposes the pane's handlers.
// The real tree catches a rejected change; the stand-in does the same so none goes unhandled.
const fire = (fn: ((...args: unknown[]) => unknown) | undefined, ...args: unknown[]) =>
  void Promise.resolve(fn?.(...args)).catch(() => {})

vi.mock('../../components/TagTree', () => ({
  TagTree: (p: Record<string, (...args: unknown[]) => unknown>) => (
    <div>
      <button onClick={() => fire(p.onAddTag, 1, 'Beige')}>add tag</button>
      <button onClick={() => fire(p.onCreateCategory, 'Mood')}>new category</button>
      <button onClick={() => fire(p.onDeleteTag, { tagId: 7, label: 'Clay', usageCount: 4 })}>
        delete tag
      </button>
      <button
        onClick={() =>
          fire(
            p.onMergeTag,
            { tagId: 7, label: 'iPhone', usageCount: 2 },
            { tagId: 8, label: 'iPhone 15 Pro', usageCount: 9 }
          )
        }
      >
        merge tag
      </button>
      <button
        onClick={() =>
          fire(p.onDeleteCategory, {
            categoryId: 3,
            categoryLabel: 'Style',
            tagCount: 2,
            tags: [{ tagId: 7, label: 'Clay', usageCount: 4 }]
          })
        }
      >
        delete category
      </button>
      <button
        onClick={() =>
          fire(p.onDeleteCategory, {
            categoryId: 9,
            categoryLabel: 'Empty',
            tagCount: 0,
            tags: []
          })
        }
      >
        delete empty category
      </button>
    </div>
  )
}))

const ok = (data: unknown) => ({ success: true, data })
const fail = () => ({ success: false, error: { code: 'X', message: 'x' } })
const NOW = new Date().toISOString()

type Handler = (payload: unknown) => unknown
let invoke: ReturnType<typeof vi.fn>
const pushes: Record<string, (payload: unknown) => void> = {}

const model = (over: Record<string, unknown> = {}) => ({
  id: 'qwen3b',
  name: 'Qwen 2.5 VL 3B',
  tier: 'medium',
  sizeBytes: 2_770_000_000,
  description: 'Good titles and tags in a few seconds per mockup.',
  languages: ['en', 'fr', 'de'],
  quality: 4,
  speed: 3,
  minMemoryGB: 8,
  bestFit: true,
  builtIn: false,
  downloadedBytes: 0,
  installed: true,
  active: true,
  ...over
})

/** The shipped pair with the 7B already on the Mac: 3B in use, 7B downloaded. */
const bothDownloaded = {
  [IPC_CHANNELS.AI_LIST_MODELS]: () =>
    ok({
      models: [
        model(),
        model({
          id: 'qwen7b',
          name: 'Qwen 2.5 VL 7B',
          active: false,
          bestFit: false,
          sizeBytes: 5_540_000_000
        })
      ],
      legacy: []
    })
}

function setup(overrides: Record<string, Handler> = {}) {
  const handlers: Record<string, Handler> = {
    [IPC_CHANNELS.STASH_INFO]: () =>
      ok({
        path: '~/Pictures/DesignStash',
        count: 128,
        bytes: 14_200_000_000,
        restartRequired: false
      }),
    [IPC_CHANNELS.STASH_CHECK_STATUS]: () =>
      ok({ lastRun: { at: NOW, trigger: 'launch', result: 'in-sync', toReview: 0 } }),
    [IPC_CHANNELS.TRASH_STATS]: () => ok({ count: 3, bytes: 412_000_000 }),
    [IPC_CHANNELS.DIALOG_SELECT_DIRECTORY]: () => ok({ path: '/Volumes/Work/Stash' }),
    [IPC_CHANNELS.BOOT_CHECK_FOLDER]: () => ok({ state: 'ok', hasLibrary: false }),
    [IPC_CHANNELS.STASH_CHANGE]: () => ok({ ok: true, restartRequired: true }),
    [IPC_CHANNELS.APP_RELAUNCH]: () => ok({ relaunching: true }),
    [IPC_CHANNELS.STASH_CHECK_RUN]: () =>
      ok({ lastRun: { at: NOW, trigger: 'manual', result: 'in-sync', toReview: 0 } }),
    [IPC_CHANNELS.TRASH_EMPTY]: () => ok({ deletedCount: 3, bytesFreed: 412_000_000 }),
    [IPC_CHANNELS.AI_HARDWARE_INFO]: () =>
      ok({
        chip: 'Apple M2 Pro',
        totalMemoryGB: 32,
        isAppleSilicon: true,
        recommendedTier: 'medium'
      }),
    [IPC_CHANNELS.AI_LIST_MODELS]: () =>
      ok({
        models: [
          model(),
          model({
            id: 'qwen7b',
            name: 'Qwen 2.5 VL 7B',
            installed: false,
            active: false,
            bestFit: false,
            sizeBytes: 5_540_000_000
          })
        ],
        legacy: []
      }),
    [IPC_CHANNELS.AI_SET_ACTIVE]: (p) => ok({ modelId: (p as { id: string | null }).id }),
    [IPC_CHANNELS.AI_DOWNLOAD_MODEL]: () => ok({ started: true }),
    [IPC_CHANNELS.AI_CANCEL_DOWNLOAD]: () => ok({ cancelled: true }),
    [IPC_CHANNELS.AI_DELETE_MODEL]: (p) =>
      (p as { confirmed?: boolean; id: string }).id === 'qwen3b' &&
      !(p as { confirmed?: boolean }).confirmed
        ? ok({ deleted: false, inUse: true, undoable: true })
        : ok({ deleted: true, inUse: false, undoable: true }),
    [IPC_CHANNELS.AI_RESTORE_MODEL]: () => ok({ restored: true }),
    [IPC_CHANNELS.TAG_TREE]: () =>
      ok({
        tree: [
          { categoryId: 3, categoryLabel: 'Style', tagCount: 1, tags: [] },
          { categoryId: 4, categoryLabel: 'Scene', tagCount: 0, tags: [] }
        ]
      }),
    [IPC_CHANNELS.TAG_CREATE]: () => ok({ tagId: 1, label: 'Beige', categoryId: 1 }),
    [IPC_CHANNELS.CATEGORY_CREATE]: () => ok({ categoryId: 5, label: 'Mood' }),
    [IPC_CHANNELS.TAG_DELETE]: () =>
      ok({ affectedMockups: 4, snapshot: { tag: { id: 7 }, mockupIds: [1] } }),
    [IPC_CHANNELS.TAG_RESTORE]: () => ok({ tagId: 7, restoredMockups: 4 }),
    [IPC_CHANNELS.TAG_MERGE_PREVIEW]: () => ok({ affectedMockups: 2 }),
    [IPC_CHANNELS.TAG_MERGE]: () => ok({ affectedMockups: 2 }),
    [IPC_CHANNELS.CATEGORY_DELETE]: () =>
      ok({
        deleted: true,
        movedTags: 0,
        snapshot: { id: 9, label: 'Empty', sortOrder: 1, isCanonical: false }
      }),
    [IPC_CHANNELS.CATEGORY_RESTORE]: () => ok({ categoryId: 9 }),
    [IPC_CHANNELS.TELEMETRY_GET_CONSENT]: () => ok({ enabled: true }),
    [IPC_CHANNELS.TELEMETRY_SET_CONSENT]: (p) => ok(p),
    [IPC_CHANNELS.APP_INFO]: () =>
      ok({ name: 'DesignStash', version: '1.0.0 (42)', env: 'production' }),
    [IPC_CHANNELS.UPDATES_STATUS]: () => ok({ state: 'up-to-date', lastCheckedAt: NOW }),
    [IPC_CHANNELS.UPDATES_CHECK]: () => ok({ state: 'up-to-date', lastCheckedAt: NOW }),
    [IPC_CHANNELS.UPDATES_CANCEL]: () => ok({ state: 'up-to-date', lastCheckedAt: NOW }),
    [IPC_CHANNELS.UPDATES_INSTALL]: () => ok({ installing: true }),
    [IPC_CHANNELS.LICENCES_TEXT]: () => ok({ text: 'MIT License for everything' }),
    [IPC_CHANNELS.REPORT_COPY]: (p) => {
      const action = (p as { action?: string } | undefined)?.action
      if (action === 'preview') return ok({ copied: false, text: 'Version: 1.0.0\n[INFO] opened' })
      if (action === 'send') return ok({ copied: false, outcome: 'sent' })
      return ok({ copied: true })
    },
    ...overrides
  }
  invoke = vi.fn(
    async (channel: string, payload: unknown) => handlers[channel]?.(payload) ?? ok({})
  )
  window.api = {
    appName: 'DesignStash',
    invoke,
    subscribe: vi.fn((channel: string, cb: (p: unknown) => void) => {
      pushes[channel] = cb
      return () => {}
    }),
    getPathForFile: vi.fn()
  } as unknown as typeof window.api
}

const calls = (channel: string) => invoke.mock.calls.filter(([name]) => name === channel)
const btn = (name: string | RegExp) => screen.getByRole('button', { name })
const goto = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

function open(props: Partial<React.ComponentProps<typeof SettingsModal>> = {}) {
  const onClose = vi.fn()
  const view = render(<SettingsModal open onClose={onClose} {...props} />)
  return { ...view, onClose }
}

beforeEach(() => {
  setup()
  toasts.toast.mockClear()
  toasts.undoToast.mockClear()
})
afterEach(() => vi.useRealTimers())

describe('Settings · the modal', () => {
  it('opens as an 880×760 modal over the page with My Stash, AI model, Tags, Privacy and About', async () => {
    open()
    const dialog = await screen.findByRole('dialog')
    expect(dialog.getAttribute('data-ds')).toBe('SettingsModal')
    expect(dialog.className).toContain('w-settings-modal')
    expect(document.querySelector('[data-ds="SettingsLayout"]')?.className).toContain(
      'h-settings-modal'
    )
    const nav = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(Array.from(nav.querySelectorAll('button')).map((b) => b.textContent)).toEqual([
      'My Stash',
      'AI model',
      'Tags',
      'Privacy',
      'About'
    ])
    expect(screen.getByRole('button', { name: 'My Stash' }).getAttribute('aria-current')).toBe(
      'page'
    )
  })

  it('closes with Esc or the ✕ and leaves the page as it was', async () => {
    const { onClose } = open()
    await screen.findByRole('dialog')
    fireEvent.click(btn('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('stays shut when it is not open', () => {
    open({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Settings · My Stash', () => {
  it('shows the stash folder with its mockup count and size', async () => {
    open()
    expect(await screen.findByText('~/Pictures/DesignStash')).not.toBeNull()
    expect(screen.getByText('128 mockups · 14.2 GB')).not.toBeNull()
  })

  /** The stash already in the picked folder, as the folder check reports it. */
  const holdsStash = {
    [IPC_CHANNELS.BOOT_CHECK_FOLDER]: () => ok({ state: 'ok', hasLibrary: true })
  }
  const buttonsIn = (dialog: HTMLElement) =>
    within(dialog)
      .getAllByRole('button')
      .map((b) => b.textContent)
      .sort()

  it('asks only Move my files or Cancel for a folder with no stash in it', async () => {
    open()
    await screen.findByText('~/Pictures/DesignStash')
    fireEvent.click(btn('Change…'))
    const dialog = await screen.findByRole('alertdialog')
    expect(calls(IPC_CHANNELS.BOOT_CHECK_FOLDER)[0]![1]).toEqual({ path: '/Volumes/Work/Stash' })
    expect(buttonsIn(dialog)).toEqual(['Cancel', 'Move my files'])
    // The description says how much would move.
    expect(dialog.textContent).toContain('128 mockups (14.2 GB)')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(calls(IPC_CHANNELS.STASH_CHANGE)).toHaveLength(0)
  })

  it('asks Use as is or Cancel for a folder that already holds a stash', async () => {
    setup(holdsStash)
    open()
    await screen.findByText('~/Pictures/DesignStash')
    fireEvent.click(btn('Change…'))
    const dialog = await screen.findByRole('alertdialog')
    // A move needs an empty folder, so it is not offered here.
    expect(buttonsIn(dialog)).toEqual(['Cancel', 'Use as is'])
    expect(dialog.textContent).toContain('already holds a stash')
  })

  it('does nothing when the folder picker is cancelled', async () => {
    setup({ [IPC_CHANNELS.DIALOG_SELECT_DIRECTORY]: () => ok({ path: null }) })
    open()
    await screen.findByText('~/Pictures/DesignStash')
    fireEvent.click(btn('Change…'))
    await waitFor(() => expect(calls(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY)).toHaveLength(1))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('shows move progress and then asks Restart now or Later', async () => {
    let finish: (value: unknown) => void = () => {}
    setup({ [IPC_CHANNELS.STASH_CHANGE]: () => new Promise((r) => (finish = r)) })
    open()
    await screen.findByText('~/Pictures/DesignStash')
    fireEvent.click(btn('Change…'))
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Move my files'
      })
    )
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.STASH_CHANGE, {
        path: '/Volumes/Work/Stash',
        mode: 'move'
      })
    )
    expect(await screen.findByText('Moving your stash')).not.toBeNull()

    act(() =>
      pushes[IPC_CHANNELS.STASH_MOVE_PROGRESS]!({
        phase: 'copying',
        copiedFiles: 10,
        totalFiles: 20,
        copiedBytes: 5_000_000_000,
        totalBytes: 10_000_000_000
      })
    )
    expect(await screen.findByText('Copying 5.0 GB of 10.0 GB')).not.toBeNull()

    await act(async () => finish(ok({ ok: true, restartRequired: true })))
    const restart = await screen.findByRole('alertdialog')
    expect(within(restart).getByText('Restart to use the new folder')).not.toBeNull()
    fireEvent.click(within(restart).getByRole('button', { name: 'Restart now' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.APP_RELAUNCH, undefined))
  })

  it('points only without a progress dialog, and Later keeps the app open', async () => {
    setup(holdsStash)
    open()
    await screen.findByText('~/Pictures/DesignStash')
    fireEvent.click(btn('Change…'))
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Use as is'
      })
    )
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.STASH_CHANGE, {
        path: '/Volumes/Work/Stash',
        mode: 'point'
      })
    )
    expect(screen.queryByText('Moving your stash')).toBeNull()
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Later' })
    )
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(calls(IPC_CHANNELS.APP_RELAUNCH)).toHaveLength(0)
    expect(screen.getByText(/takes effect the next time DesignStash starts/)).not.toBeNull()
  })

  it('says in plain words why a folder change did not happen', async () => {
    setup({ [IPC_CHANNELS.STASH_CHANGE]: () => ok({ ok: false, reason: 'not-empty' }) })
    open()
    await screen.findByText('~/Pictures/DesignStash')
    fireEvent.click(btn('Change…'))
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Move my files'
      })
    )
    await waitFor(() => expect(toasts.toast).toHaveBeenCalled())
    const { description } = toasts.toast.mock.calls[0]![0]
    expect(description).toBe('That folder already has files in it. Pick an empty one.')
    expect(description).not.toMatch(/not-empty|\//)
  })

  it('shows the stash check as In sync, with when it ran and Check now', async () => {
    open()
    expect(await screen.findByText('In sync')).not.toBeNull()
    expect(screen.getByText(/Checked when DesignStash opened, today/)).not.toBeNull()
    fireEvent.click(btn('Check now'))
    await waitFor(() => expect(calls(IPC_CHANNELS.STASH_CHECK_RUN)).toHaveLength(1))
  })

  it('shows what the check found as N to review, with Review…', async () => {
    setup({
      [IPC_CHANNELS.STASH_CHECK_STATUS]: () =>
        ok({ lastRun: { at: NOW, trigger: 'launch', result: 'review', toReview: 3 } })
    })
    const onReview = vi.fn()
    const { onClose } = open({ onReview })
    expect(await screen.findByText('3 to review')).not.toBeNull()
    fireEvent.click(btn('Review…'))
    await waitFor(() => expect(onReview).toHaveBeenCalledOnce())
    expect(onClose).toHaveBeenCalled()
  })

  it('reads Couldn’t check with Check now when the check failed', async () => {
    setup({
      [IPC_CHANNELS.STASH_CHECK_STATUS]: () =>
        ok({ lastRun: { at: NOW, trigger: 'manual', result: 'could-not-check', toReview: 0 } })
    })
    open()
    expect(await screen.findByText('Couldn’t check')).not.toBeNull()
    expect(btn('Check now')).not.toBeNull()
    expect(document.body.textContent).not.toMatch(/could-not-check/)
  })

  it('shows the Trash count and size with Open Trash, and asks once before Empty Trash…', async () => {
    const onOpenTrash = vi.fn()
    const { onClose } = open({ onOpenTrash })
    expect(await screen.findByText('3 mockups · 412 MB, kept until you empty it.')).not.toBeNull()
    fireEvent.click(btn('Open Trash'))
    expect(onClose).toHaveBeenCalled()
    expect(onOpenTrash).toHaveBeenCalledOnce()

    fireEvent.click(btn('Empty Trash…'))
    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(/permanently deletes 3 mockups and frees 412 MB/)
    ).not.toBeNull()
    expect(calls(IPC_CHANNELS.TRASH_EMPTY)).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Empty Trash' }))
    await waitFor(() => expect(calls(IPC_CHANNELS.TRASH_EMPTY)).toHaveLength(1))
    // No undo for this one.
    expect(toasts.undoToast).not.toHaveBeenCalled()
  })
})

describe('Settings · Trash row', () => {
  it('says Trash is empty at 0 and turns Empty Trash… off, keeping Open Trash', async () => {
    setup({ [IPC_CHANNELS.TRASH_STATS]: () => ok({ count: 0, bytes: 0 }) })
    open()
    expect(await screen.findByText('Trash is empty.')).not.toBeNull()
    expect((btn('Empty Trash…') as HTMLButtonElement).disabled).toBe(true)
    expect((btn('Open Trash') as HTMLButtonElement).disabled).toBe(false)
    expect(document.body.textContent).not.toContain('0 mockups · 0 B')
  })
})

describe('Settings · AI model', () => {
  it('shows this Mac and lists Your models, then Available to download', async () => {
    open()
    goto('AI model')
    expect(await screen.findByText('Apple M2 Pro · 32 GB memory')).not.toBeNull()
    expect(screen.getByText('Your models')).not.toBeNull()
    expect(screen.getByText('Available to download')).not.toBeNull()
    const cards = Array.from(document.querySelectorAll('[data-ds="ModelCard"]'))
    expect(cards.map((c) => c.getAttribute('data-state'))).toEqual(['in-use', 'available'])
    expect(screen.getByText('In use')).not.toBeNull()
    expect(screen.getByText('Best fit for this Mac')).not.toBeNull()
  })

  it('keeps the models listed when on-device AI is off, with Use disabled and a reason', async () => {
    open()
    goto('AI model')
    const toggle = await screen.findByRole('switch', { name: 'Use on-device AI' })
    fireEvent.click(toggle)
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.AI_SET_ACTIVE, { id: null })
    )
    expect(screen.getByText(/Titles come from file names/)).not.toBeNull()
    expect(screen.getByText('Your models')).not.toBeNull()
    expect(screen.getByText('Turn on AI to use a model.')).not.toBeNull()
    expect(screen.getAllByRole('button', { name: 'Delete' }).length).toBeGreaterThan(0)
    for (const use of screen.queryAllByRole('button', { name: 'Use this model' })) {
      expect((use as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('downloads a model with progress, speed and time left, and cancels it', async () => {
    open()
    goto('AI model')
    await screen.findByText('Available to download')
    fireEvent.click(btn('Download'))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.AI_DOWNLOAD_MODEL, { id: 'qwen7b' })
    )
    act(() =>
      pushes[IPC_CHANNELS.AI_DOWNLOAD_PROGRESS]!({
        modelId: 'qwen7b',
        receivedBytes: 2_327_000_000,
        totalBytes: 5_540_000_000,
        phase: 'downloading',
        bytesPerSecond: 18_000_000,
        secondsLeft: 180
      })
    )
    expect(await screen.findByText('Downloading 42% · 18 MB/s · about 3 min left')).not.toBeNull()
    fireEvent.click(btn('Cancel'))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.AI_CANCEL_DOWNLOAD, { id: 'qwen7b' })
    )
  })

  it('says why a download stopped and offers Try again', async () => {
    open()
    goto('AI model')
    await screen.findByText('Available to download')
    act(() =>
      pushes[IPC_CHANNELS.AI_DOWNLOAD_PROGRESS]!({
        modelId: 'qwen7b',
        receivedBytes: 1,
        totalBytes: 5_540_000_000,
        phase: 'error',
        reason: 'disk-full'
      })
    )
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The download stopped because your disk is full. Free up some space, then try again.'
    )
    fireEvent.click(btn('Try again'))
    await waitFor(() => expect(calls(IPC_CHANNELS.AI_DOWNLOAD_MODEL)).toHaveLength(1))
  })

  it('shows a model being checked as its own state, with nothing to cancel', async () => {
    open()
    goto('AI model')
    await screen.findByText('Available to download')
    act(() =>
      pushes[IPC_CHANNELS.AI_DOWNLOAD_PROGRESS]!({
        modelId: 'qwen7b',
        receivedBytes: 5_540_000_000,
        totalBytes: 5_540_000_000,
        phase: 'verifying'
      })
    )
    expect(await screen.findByText('Checking the download…')).not.toBeNull()
    expect(screen.queryByText(/Downloading \d+%/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('loads the models again when a download fails, so sizes are never stale', async () => {
    open()
    goto('AI model')
    await screen.findByText('Available to download')
    const before = calls(IPC_CHANNELS.AI_LIST_MODELS).length
    act(() =>
      pushes[IPC_CHANNELS.AI_DOWNLOAD_PROGRESS]!({
        modelId: 'qwen7b',
        receivedBytes: 1,
        totalBytes: 5_540_000_000,
        phase: 'error',
        reason: 'offline'
      })
    )
    await waitFor(() => expect(calls(IPC_CHANNELS.AI_LIST_MODELS).length).toBe(before + 1))
  })

  it('uses a downloaded model with one button, never the whole card', async () => {
    setup(bothDownloaded)
    open()
    goto('AI model')
    await screen.findByText('Your models')
    const card = document.querySelector('[data-state="downloaded"]')!
    fireEvent.click(card)
    expect(calls(IPC_CHANNELS.AI_SET_ACTIVE)).toHaveLength(0)
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Use this model' }))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.AI_SET_ACTIVE, { id: 'qwen7b' })
    )
  })

  it('asks before deleting the model in use, and says AI titles and tags stop', async () => {
    open()
    goto('AI model')
    await screen.findByText('Your models')
    const inUse = document.querySelector('[data-state="in-use"]') as HTMLElement
    fireEvent.click(within(inUse).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(/AI titles and tags stop until you pick another model/)
    ).not.toBeNull()
    expect(calls(IPC_CHANNELS.AI_DELETE_MODEL)).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.AI_DELETE_MODEL, {
        id: 'qwen3b',
        confirmed: true
      })
    )
  })

  it('deletes any other model at once with Undo', async () => {
    setup(bothDownloaded)
    open()
    goto('AI model')
    await screen.findByText('Your models')
    const other = document.querySelector('[data-state="downloaded"]') as HTMLElement
    fireEvent.click(within(other).getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.AI_DELETE_MODEL, { id: 'qwen7b' })
    )
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(toasts.undoToast).toHaveBeenCalledWith('Qwen 2.5 VL 7B deleted', expect.any(Function))
    toasts.undoToast.mock.calls[0]![1]()
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.AI_RESTORE_MODEL, { id: 'qwen7b' })
    )
  })

  it('offers Apple’s built-in model as its own card, with nothing to download or delete', async () => {
    setup({
      [IPC_CHANNELS.AI_LIST_MODELS]: () =>
        ok({
          models: [
            model(),
            model({
              id: 'apple',
              name: 'Apple’s on-device model',
              tier: 'small',
              sizeBytes: 0,
              bestFit: false,
              builtIn: true,
              installed: true,
              active: false
            })
          ],
          legacy: []
        })
    })
    open()
    goto('AI model')
    await screen.findByText('Built into macOS')
    const card = screen
      .getByText('Apple’s on-device model')
      .closest('[data-ds="ModelCard"]') as HTMLElement
    expect(within(card).getByText('Built in, no download')).not.toBeNull()
    expect(within(card).queryByRole('button', { name: 'Delete' })).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'Use this model' }))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.AI_SET_ACTIVE, { id: 'apple' })
    )
  })

  it('says why Apple’s model in use makes no suggestions, and lets another be chosen', async () => {
    setup({
      [IPC_CHANNELS.AI_LIST_MODELS]: () =>
        ok({
          models: [model({ active: false })],
          legacy: [],
          activeProblem: 'apple-intelligence-off'
        })
    })
    open()
    goto('AI model')
    const banner = (await screen.findByText('Apple Intelligence is turned off')).closest(
      '[data-ds="Banner"]'
    ) as HTMLElement
    expect(within(banner).getByText(/Turn it on in System Settings, or choose another model/)).not.toBeNull()
    // AI is still on: the person only has to pick a model.
    expect(screen.getByRole('switch', { name: 'Use on-device AI' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Use this model' }))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.AI_SET_ACTIVE, { id: 'qwen3b' })
    )
  })

  it('turns the switch off for Intel, with the plain reason', async () => {
    setup({
      [IPC_CHANNELS.AI_HARDWARE_INFO]: () =>
        ok({
          chip: 'Intel Core i7',
          totalMemoryGB: 16,
          isAppleSilicon: false,
          recommendedTier: 'small'
        })
    })
    open()
    goto('AI model')
    expect(await screen.findByText('Not supported')).not.toBeNull()
    expect(
      (screen.getByRole('switch', { name: 'Use on-device AI' }) as HTMLButtonElement).disabled
    ).toBe(true)
  })
})

describe('Settings · Tags', () => {
  it('adds a tag to a category and a new category', async () => {
    open()
    goto('Tags')
    fireEvent.click(await screen.findByText('add tag'))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.TAG_CREATE, {
        label: 'Beige',
        categoryId: 1
      })
    )
    fireEvent.click(screen.getByText('new category'))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.CATEGORY_CREATE, { label: 'Mood' })
    )
    expect(calls(IPC_CHANNELS.TAG_TREE).length).toBeGreaterThanOrEqual(3)
  })

  it('deletes a tag at once with Undo that restores it on every mockup', async () => {
    open()
    goto('Tags')
    fireEvent.click(await screen.findByText('delete tag'))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.TAG_DELETE, { tagId: 7 }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await waitFor(() => expect(toasts.undoToast).toHaveBeenCalled())
    expect(toasts.undoToast.mock.calls[0]![0]).toBe('Deleted “Clay”')
    toasts.undoToast.mock.calls[0]![1]()
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.TAG_RESTORE, {
        snapshot: { tag: { id: 7 }, mockupIds: [1] }
      })
    )
  })

  it('asks before merging, with how many mockups move', async () => {
    open()
    goto('Tags')
    fireEvent.click(await screen.findByText('merge tag'))
    const dialog = await screen.findByRole('dialog', {
      name: /Merge “iPhone” into “iPhone 15 Pro”/
    })
    expect(await within(dialog).findByText(/2 mockups will move to “iPhone 15 Pro”/)).not.toBeNull()
    expect(calls(IPC_CHANNELS.TAG_MERGE)).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Merge' }))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.TAG_MERGE, {
        sourceTagId: 7,
        targetTagId: 8
      })
    )
  })

  it('asks where a category’s tags go before deleting it, and deletes an empty one at once with Undo', async () => {
    open()
    goto('Tags')
    fireEvent.click(await screen.findByText('delete category'))
    const dialog = await screen.findByRole('dialog', { name: /Delete “Style”/ })
    expect(within(dialog).getByText('Move its tags to')).not.toBeNull()
    expect(calls(IPC_CHANNELS.CATEGORY_DELETE)).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete category' }))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.CATEGORY_DELETE, {
        categoryId: 3,
        moveTagsTo: 4
      })
    )
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Delete “Style”/ })).toBeNull())

    fireEvent.click(screen.getByText('delete empty category'))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.CATEGORY_DELETE, { categoryId: 9 })
    )
    await waitFor(() => expect(toasts.undoToast).toHaveBeenCalled())
    toasts.undoToast.mock.calls[0]![1]()
    await waitFor(() => expect(calls(IPC_CHANNELS.CATEGORY_RESTORE)).toHaveLength(1))
  })

  it('tells the person and keeps going when a tag change fails', async () => {
    setup({ [IPC_CHANNELS.TAG_CREATE]: () => fail() })
    open()
    goto('Tags')
    fireEvent.click(await screen.findByText('add tag'))
    await waitFor(() => expect(toasts.toast).toHaveBeenCalled())
    expect(toasts.toast.mock.calls[0]![0].message).toBe('Couldn’t add that tag')
  })
})

describe('Settings · Privacy', () => {
  it('shares usage data only while its switch is on, and stops at once when it is turned off', async () => {
    open()
    goto('Privacy')
    const toggle = await screen.findByRole('switch', { name: 'Share anonymous usage data' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('What we collect')).not.toBeNull()
    fireEvent.click(toggle)
    // What is collected stays on show, switch on or off.
    expect(screen.getByText('What we collect')).not.toBeNull()
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.TELEMETRY_SET_CONSENT, { enabled: false })
    )
    fireEvent.click(screen.getByRole('switch', { name: 'Share anonymous usage data' }))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.TELEMETRY_SET_CONSENT, { enabled: true })
    )
    expect(screen.getByText('What we never collect')).not.toBeNull()
  })

  it('shows what is collected even when consent is off', async () => {
    setup({ [IPC_CHANNELS.TELEMETRY_GET_CONSENT]: () => ok({ enabled: false }) })
    open()
    goto('Privacy')
    expect((await screen.findByRole('switch')).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('What we collect')).not.toBeNull()
    expect(screen.getByText('What we never collect')).not.toBeNull()
  })
})

describe('Settings · About', () => {
  it('shows the version and the update status, with Check for updates', async () => {
    open()
    goto('About')
    expect(await screen.findByText('Version 1.0.0 (42)')).not.toBeNull()
    expect(screen.getByText('Up to date')).not.toBeNull()
    expect(screen.getByText(/^Checked today/)).not.toBeNull()
    fireEvent.click(btn('Check for updates'))
    await waitFor(() => expect(calls(IPC_CHANNELS.UPDATES_CHECK)).toHaveLength(1))
  })

  it('runs one check when the menu’s Check for Updates… opened it, and none the next time', async () => {
    useUiStore.getState().requestUpdateCheck()
    const first = open({ section: 'about' })
    await waitFor(() => expect(calls(IPC_CHANNELS.UPDATES_CHECK)).toHaveLength(1))
    expect(useUiStore.getState().updateCheckPending).toBe(false)
    first.unmount()
    open({ section: 'about' })
    expect(await screen.findByText('Version 1.0.0 (42)')).not.toBeNull()
    expect(calls(IPC_CHANNELS.UPDATES_CHECK)).toHaveLength(1)
  })

  it('a Check for Updates… while About is already open checks again, and Download still installs', async () => {
    setup({
      [IPC_CHANNELS.UPDATES_CHECK]: () =>
        ok({
          state: 'available',
          version: '1.1.0',
          notes: '',
          releaseUrl: 'https://github.com/NeeshSamsi/DesignStash/releases/tag/v1.1.0',
          lastCheckedAt: NOW
        })
    })
    open({ section: 'about' })
    expect(await screen.findByText('Up to date')).not.toBeNull()
    act(() => useUiStore.getState().requestUpdateCheck())
    expect(await screen.findByText('Version 1.1.0 is available.')).not.toBeNull()
    expect(calls(IPC_CHANNELS.UPDATES_CHECK)).toHaveLength(1)
    fireEvent.click(btn('Download'))
    await waitFor(() => expect(calls(IPC_CHANNELS.UPDATES_INSTALL)).toHaveLength(1))
  })

  it('claims nothing before the first check: no Up to date tag, just Not checked yet', async () => {
    setup({ [IPC_CHANNELS.UPDATES_STATUS]: () => ok({ state: 'up-to-date', lastCheckedAt: null }) })
    open()
    goto('About')
    expect(await screen.findByText('Not checked yet')).not.toBeNull()
    expect(screen.queryByText('Up to date')).toBeNull()
  })

  it('shows update progress with Cancel, and Restart now when it is ready', async () => {
    setup({
      [IPC_CHANNELS.UPDATES_STATUS]: () =>
        ok({ state: 'downloading', version: '1.1.0', progress: 0.4, lastCheckedAt: NOW })
    })
    const first = open()
    goto('About')
    expect(await screen.findByText('1.1.0')).not.toBeNull()
    expect(screen.getByText('Downloading 40%')).not.toBeNull()
    fireEvent.click(btn('Cancel'))
    await waitFor(() => expect(calls(IPC_CHANNELS.UPDATES_CANCEL)).toHaveLength(1))
    first.unmount()

    setup({
      [IPC_CHANNELS.UPDATES_STATUS]: () =>
        ok({ state: 'ready', version: '1.1.0', lastCheckedAt: NOW })
    })
    open()
    goto('About')
    fireEvent.click(await screen.findByRole('button', { name: 'Restart now' }))
    await waitFor(() => expect(calls(IPC_CHANNELS.UPDATES_INSTALL)).toHaveLength(1))
  })

  it('offers a newer release with What’s new and Download', async () => {
    setup({
      [IPC_CHANNELS.UPDATES_STATUS]: () =>
        ok({
          state: 'available',
          version: '1.1.0',
          notes: '### Features\n\n* a new thing',
          releaseUrl: 'https://github.com/NeeshSamsi/DesignStash/releases/tag/v1.1.0',
          lastCheckedAt: NOW
        })
    })
    open()
    goto('About')
    expect(await screen.findByText('Version 1.1.0 is available.')).not.toBeNull()
    fireEvent.click(btn('What’s new'))
    expect(await screen.findByRole('dialog', { name: 'What’s new in 1.1.0' })).not.toBeNull()
    expect(screen.getByText(/a new thing/)).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(btn('Download'))
    await waitFor(() => expect(calls(IPC_CHANNELS.UPDATES_INSTALL)).toHaveLength(1))
  })

  it('says it could not check, in the row and without an error toast', async () => {
    setup({
      [IPC_CHANNELS.UPDATES_STATUS]: () => ok({ state: 'check-failed', lastCheckedAt: null }),
      [IPC_CHANNELS.UPDATES_CHECK]: () => ok({ state: 'check-failed', lastCheckedAt: null })
    })
    open()
    goto('About')
    expect(await screen.findByText(/^Couldn’t check\./)).not.toBeNull()
    fireEvent.click(btn('Check for updates'))
    await waitFor(() => expect(calls(IPC_CHANNELS.UPDATES_CHECK)).toHaveLength(1))
    expect(screen.queryByText('Couldn’t check for updates')).toBeNull()
  })

  it('shows the licences in a View modal', async () => {
    open()
    goto('About')
    fireEvent.click(await screen.findByRole('button', { name: 'View' }))
    expect(await screen.findByText('MIT License for everything')).not.toBeNull()
    expect(screen.getByRole('dialog', { name: 'Open-source licences' })).not.toBeNull()
  })

  it('opens the report dialog, shows what will be sent in full and sends it with the message', async () => {
    open()
    goto('About')
    fireEvent.click(await screen.findByRole('button', { name: 'Report…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Report a problem' })
    expect(dialog).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect((await screen.findByTestId('report-details')).textContent).toContain('[INFO] opened')
    fireEvent.change(screen.getByRole('textbox', { name: 'What happened' }), {
      target: { value: 'The import froze' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(toasts.toast).toHaveBeenCalled())
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.REPORT_COPY, {
      action: 'send',
      message: 'The import froze'
    })
    expect(toasts.toast.mock.calls[0]![0].message).toBe('Thanks, your report was sent')
  })

  it('offers Copy report when the report could not be sent', async () => {
    setup({
      [IPC_CHANNELS.REPORT_COPY]: (p) => {
        const action = (p as { action?: string } | undefined)?.action
        if (action === 'preview') return ok({ copied: false, text: 'Version: 1.0.0' })
        if (action === 'send') return ok({ copied: false, outcome: 'unavailable' })
        return ok({ copied: true })
      }
    })
    open()
    goto('About')
    fireEvent.click(await screen.findByRole('button', { name: 'Report…' }))
    await screen.findByRole('dialog', { name: 'Report a problem' })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Copy report' }))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.REPORT_COPY, { action: 'copy-full', message: '' })
    )
  })

  it('offers no orange text links', async () => {
    open()
    goto('About')
    await screen.findByText('Version 1.0.0 (42)')
    expect(document.querySelector('a')).toBeNull()
  })
})

describe('Meaning search row', () => {
  const meaning = (over: Record<string, unknown> = {}) => ({
    id: 'nomic-embed-v1.5',
    name: 'Meaning search',
    description: 'Finds mockups by what a search means.',
    license: 'Apache 2.0',
    sizeBytes: 146_146_432,
    downloadedBytes: 0,
    installed: false,
    ...over
  })
  const withMeaning = (over: Record<string, unknown> = {}) => ({
    [IPC_CHANNELS.AI_LIST_MODELS]: () =>
      ok({ models: [model()], meaning: meaning(over), legacy: [], activeProblem: null })
  })

  it('downloads from its own button and shows progress with Cancel', async () => {
    setup(withMeaning())
    open()
    goto('AI model')
    const row = (await screen.findByTestId('meaning-search-row')) as HTMLElement
    expect(within(row).getByText('146 MB')).toBeTruthy()
    fireEvent.click(within(row).getByRole('button', { name: 'Download' }))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.AI_DOWNLOAD_MODEL, { id: 'nomic-embed-v1.5' })
    )
    expect(within(row).getByRole('button', { name: 'Cancel' })).toBeTruthy()
  })

  it('offers Try again after a failed download, and Resume for a partial one', async () => {
    setup(withMeaning({ downloadedBytes: 50_000_000 }))
    open()
    goto('AI model')
    const row = (await screen.findByTestId('meaning-search-row')) as HTMLElement
    expect(within(row).getByRole('button', { name: 'Resume' })).toBeTruthy()
    act(() =>
      pushes[IPC_CHANNELS.AI_DOWNLOAD_PROGRESS]!({
        modelId: 'nomic-embed-v1.5',
        receivedBytes: 50_000_000,
        totalBytes: 146_146_432,
        phase: 'error',
        reason: 'offline'
      })
    )
    expect(await within(row).findByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('deletes with Undo once installed, without a confirm', async () => {
    setup(withMeaning({ installed: true, downloadedBytes: 146_146_432 }))
    open()
    goto('AI model')
    const row = (await screen.findByTestId('meaning-search-row')) as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.AI_DELETE_MODEL, { id: 'nomic-embed-v1.5' })
    )
    await waitFor(() =>
      expect(toasts.undoToast).toHaveBeenCalledWith('Meaning search deleted', expect.any(Function))
    )
  })
})
