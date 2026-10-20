import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import { IPC_CHANNELS } from '@shared/ipc'
import { useGroupingStore } from './stores/groupingStore'
import { useApprovalStore } from './stores/approvalStore'
import { useLibraryStore } from './stores/libraryStore'

beforeEach(() => {
  useGroupingStore.setState({
    groups: [],
    singletons: [],
    batchId: null,
    isLoading: false,
    isConfirming: false
  })
  useApprovalStore.setState({
    queue: [],
    currentIndex: 0,
    isSaving: false,
    isInitializing: false,
    isComplete: false
  })
  useLibraryStore.setState({
    items: [],
    query: '',
    tagFilter: [],
    sort: 'date',
    stats: { total: 0, favourites: 0, groups: 0, trashed: 0 },
    isLoading: false,
    trash: [],
    selectedDetail: null
  })

  // Provide a stub preload bridge — jsdom has no real `window.api`.
  window.api = {
    appName: 'DesignStash',
    invoke: vi.fn(async (channel: string) => {
      if (channel === 'app:info' || channel === IPC_CHANNELS.APP_INFO) {
        return { success: true, data: { name: 'DesignStash', version: '0.0.0', env: 'test' } }
      }
      if (channel === IPC_CHANNELS.SETTINGS_GET) {
        // onboarded: true so existing tests bypass the first-run disclosure.
        return {
          success: true,
          data: { libraryRoot: '/lib', onboarded: true, telemetryEnabled: true }
        }
      }
      if (channel === IPC_CHANNELS.TELEMETRY_GET_CONSENT) {
        return { success: true, data: { enabled: true } }
      }
      if (channel === IPC_CHANNELS.TELEMETRY_SET_CONSENT) {
        return { success: true, data: { enabled: true } }
      }
      if (channel === IPC_CHANNELS.TELEMETRY_TRACK) {
        return { success: true, data: undefined }
      }
      if (channel === IPC_CHANNELS.IMPORT_START) {
        return {
          success: true,
          data: {
            batchId: '123',
            items: [],
            imported: 1,
            pendingPreview: 0,
            duplicates: 0,
            errors: 0,
            skippedNonPsd: 0
          }
        }
      }
      if (channel === IPC_CHANNELS.GROUPING_PROPOSE) {
        return { success: true, data: { batchId: '123', groups: [], singletons: [] } }
      }
      if (channel === IPC_CHANNELS.APPROVAL_INIT) {
        return { success: true, data: { batchId: '123', items: [] } }
      }
      if (channel === IPC_CHANNELS.TAG_LIST_BY_CATEGORY) {
        return { success: true, data: { categories: [] } }
      }
      if (channel === IPC_CHANNELS.LIBRARY_LIST) {
        return { success: true, data: { items: [] } }
      }
      if (channel === IPC_CHANNELS.INBOX_COUNTS) {
        return { success: true, data: { toSort: 0, toStash: 0, sniffing: 0, trash: 0 } }
      }
      if (channel === IPC_CHANNELS.LIBRARY_STATS) {
        return { success: true, data: { total: 0, favourites: 0, groups: 0, trashed: 0 } }
      }
      if (channel === IPC_CHANNELS.MOCKUP_DETAIL) {
        return {
          success: true,
          data: {
            item: {
              id: 1,
              title: 'Hero',
              description: null,
              coverPath: '/p/hero.png',
              isGroup: false,
              favourite: false,
              reviewStatus: 'approved',
              variantCount: 1,
              tags: []
            },
            variants: []
          }
        }
      }
      if (channel === IPC_CHANNELS.LIBRARY_TRASH_LIST) {
        return { success: true, data: { items: [] } }
      }
      if (channel === IPC_CHANNELS.TAG_TREE) {
        return { success: true, data: { tree: [] } }
      }
      if (channel === IPC_CHANNELS.INTEGRITY_SCAN) {
        return { success: true, data: { orphanFiles: [], orphanRecords: [] } }
      }
      if (channel === IPC_CHANNELS.APP_INFO) {
        return { success: true, data: { name: 'DesignStash', version: '0.0.0', env: 'test' } }
      }
      if (channel === IPC_CHANNELS.ENTITLEMENTS_SNAPSHOT) {
        return {
          success: true,
          data: { tier: 'free', enabled: { 'search.semantic': true, 'app.core': true } }
        }
      }
      if (channel === IPC_CHANNELS.DEBUG_READ_SETTINGS) {
        return { success: true, data: { path: '/stub/settings.json', json: '{}', exists: false } }
      }
      return { success: true, data: { success: true, message: 'pong', timestamp: 0 } }
    }),
    subscribe: vi.fn(() => () => {}),
    onImportProgress: vi.fn(() => () => {}),
    onAiDownloadProgress: vi.fn(() => () => {}),
    getPathForFile: vi.fn((file) => `/path/to/${file.name}`)
  } as unknown as typeof window.api
})

describe('App', () => {
  it('renders the window with its sidebar', async () => {
    render(<App />)
    expect(await screen.findByRole('button', { name: /Add a mockup/ })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy()
  })

  it('calls IMPORT_START on drop', async () => {
    render(<App />)
    // Wait for consent state to resolve so the real app (AppShell) is mounted.
    await screen.findByRole('navigation', { name: 'Primary' })
    const dropzone = document.querySelector('[data-slot="app-shell"]') as HTMLElement
    const file = new File([''], 'test.psd', { type: 'image/vnd.adobe.photoshop' })
    const dataTransfer = {
      files: [file],
      items: [
        {
          kind: 'file',
          type: file.type,
          getAsFile: () => file
        }
      ],
      types: ['Files']
    }
    fireEvent.drop(dropzone, { dataTransfer })
    expect(window.api.invoke).toHaveBeenCalledWith(IPC_CHANNELS.IMPORT_START, {
      paths: ['/path/to/test.psd']
    })
  })

  it('shows onboarding Welcome step when not onboarded', async () => {
    ;(window.api.invoke as ReturnType<typeof vi.fn>).mockImplementation(async (channel: string) => {
      if (channel === IPC_CHANNELS.SETTINGS_GET) {
        return {
          success: true,
          data: { libraryRoot: '/lib', onboarded: false, telemetryEnabled: true }
        }
      }
      return { success: true, data: {} }
    })

    render(<App />)
    expect(await screen.findByText('Get Started')).toBeTruthy()
  })

  it('onboarding skip flow reaches privacy step and calls TELEMETRY_SET_CONSENT', async () => {
    ;(window.api.invoke as ReturnType<typeof vi.fn>).mockImplementation(async (channel: string) => {
      if (channel === IPC_CHANNELS.SETTINGS_GET) {
        return {
          success: true,
          data: { libraryRoot: '/lib', onboarded: false, telemetryEnabled: true }
        }
      }
      if (channel === IPC_CHANNELS.AI_HARDWARE_INFO) {
        return {
          success: true,
          data: {
            chip: 'Apple M1',
            totalMemoryGB: 8,
            isAppleSilicon: true,
            recommendedTier: 'small'
          }
        }
      }
      if (channel === IPC_CHANNELS.AI_LIST_MODELS) {
        return { success: true, data: { models: [] } }
      }
      if (channel === IPC_CHANNELS.TELEMETRY_SET_CONSENT) {
        return { success: true, data: { enabled: false } }
      }
      return { success: true, data: {} }
    })

    render(<App />)
    // Welcome step → Library step
    fireEvent.click(await screen.findByText('Get Started'))
    // Library step → AI step
    fireEvent.click(await screen.findByText('Continue'))
    // AI step — switch to skip mode then advance
    fireEvent.click(await screen.findByText('Skip for now'))
    fireEvent.click(await screen.findByText('Skip — use manual tagging'))
    // Privacy step — opt out
    fireEvent.click(await screen.findByText('No thanks'))
    expect(window.api.invoke).toHaveBeenCalledWith(IPC_CHANNELS.TELEMETRY_SET_CONSENT, {
      enabled: false
    })
  })

  it('completing approval flow re-fetches LIBRARY_LIST', async () => {
    ;(window.api.invoke as ReturnType<typeof vi.fn>).mockImplementation(async (channel: string) => {
      if (channel === IPC_CHANNELS.SETTINGS_GET)
        return {
          success: true,
          data: { libraryRoot: '/lib', onboarded: true, telemetryEnabled: true }
        }
      if (channel === IPC_CHANNELS.IMPORT_START)
        return {
          success: true,
          data: {
            batchId: 'b1',
            items: [],
            imported: 1,
            pendingPreview: 0,
            duplicates: 0,
            errors: 0,
            skippedNonPsd: 0
          }
        }
      if (channel === IPC_CHANNELS.GROUPING_PROPOSE)
        return {
          success: true,
          data: {
            batchId: 'b1',
            groups: [],
            singletons: [
              { mockupId: 1, fileName: 'test.psd', coverPath: '/t.png', isPrimary: true }
            ]
          }
        }
      if (channel === IPC_CHANNELS.GROUPING_CONFIRM) return { success: true, data: { ok: true } }
      if (channel === IPC_CHANNELS.APPROVAL_INIT)
        return {
          success: true,
          data: {
            batchId: 'b1',
            items: [
              {
                mockupId: 1,
                title: 'Test',
                description: '',
                coverPath: '/t.png',
                coverSource: 'embedded',
                tags: [],
                isLeader: true,
                leaderId: null,
                variantIndex: 0
              }
            ]
          }
        }
      if (channel === IPC_CHANNELS.APPROVAL_SAVE_ITEM)
        return { success: true, data: { reinferredItems: [] } }
      if (channel === IPC_CHANNELS.TAG_LIST_BY_CATEGORY)
        return { success: true, data: { categories: [] } }
      if (channel === IPC_CHANNELS.LIBRARY_LIST) return { success: true, data: { items: [] } }
      if (channel === IPC_CHANNELS.LIBRARY_STATS)
        return { success: true, data: { total: 0, favourites: 0, groups: 0, trashed: 0 } }
      if (channel === IPC_CHANNELS.INTEGRITY_SCAN)
        return { success: true, data: { orphanFiles: [], orphanRecords: [] } }
      return { success: true, data: {} }
    })

    render(<App />)
    await screen.findByRole('navigation', { name: 'Primary' })

    // Drop a file to trigger import
    const dropzone = document.querySelector('[data-slot="app-shell"]') as HTMLElement
    const file = new File([''], 'test.psd', { type: 'image/vnd.adobe.photoshop' })
    const dataTransfer = {
      files: [file],
      items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
      types: ['Files']
    }
    fireEvent.drop(dropzone, { dataTransfer })

    // GroupingReview appears — confirm grouping
    const confirmBtn = await screen.findByRole('button', { name: 'Confirm' })
    fireEvent.click(confirmBtn)

    // ApprovalStepper appears — approve the single item
    const approveBtn = await screen.findByRole('button', { name: 'Approve & Finish' })
    fireEvent.click(approveBtn)

    // After completion, LIBRARY_LIST should be re-fetched
    await waitFor(() => {
      const calls = (window.api.invoke as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.some(([ch]) => ch === IPC_CHANNELS.LIBRARY_LIST)).toBe(true)
    })
  })

  it('blocking reconciliation modal appears when boot scan finds drift', async () => {
    ;(window.api.invoke as ReturnType<typeof vi.fn>).mockImplementation(async (channel: string) => {
      if (channel === IPC_CHANNELS.SETTINGS_GET)
        return {
          success: true,
          data: { libraryRoot: '/lib', onboarded: true, telemetryEnabled: true }
        }
      if (channel === IPC_CHANNELS.INTEGRITY_SCAN)
        return { success: true, data: { orphanFiles: ['/stash/lost.psd'], orphanRecords: [] } }
      if (channel === IPC_CHANNELS.LIBRARY_LIST) return { success: true, data: { items: [] } }
      if (channel === IPC_CHANNELS.LIBRARY_STATS)
        return { success: true, data: { total: 0, favourites: 0, groups: 0, trashed: 0 } }
      return { success: true, data: {} }
    })

    render(<App />)
    expect(await screen.findByText('Library out of sync')).toBeTruthy()
    // The file is listed
    expect(await screen.findByText('/stash/lost.psd')).toBeTruthy()
    // Ignoring it resolves the drift and closes the modal
    fireEvent.click(screen.getByRole('button', { name: 'Ignore' }))
    await waitFor(() => {
      expect(screen.queryByText('Library out of sync')).toBeNull()
    })
  })

  it('Sort on To sort opens the grouping review for the cards’ import batch', async () => {
    const base = window.api.invoke as ReturnType<typeof vi.fn>
    const previous = base.getMockImplementation() as (c: string, r: unknown) => unknown
    base.mockImplementation(async (channel: string, request: unknown) => {
      if (channel === IPC_CHANNELS.INBOX_LIST) {
        return {
          success: true,
          data: {
            items: [
              {
                id: 7,
                title: 'a.psd',
                description: null,
                coverPath: '/c/a.webp',
                coverSource: 'embedded',
                coverMissing: false,
                isGroup: false,
                favourite: false,
                reviewStatus: 'pending',
                createdAt: '2026-10-11',
                variantCount: 0,
                topId: null,
                tags: [],
                stage: 'to_sort',
                aiStatus: 'ready',
                sizeBytes: 1,
                batchId: 'batch-7'
              }
            ]
          }
        }
      }
      if (channel === IPC_CHANNELS.INBOX_COUNTS) {
        return { success: true, data: { toSort: 1, toStash: 0, sniffing: 0, trash: 0 } }
      }
      return previous(channel, request)
    })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /To sort/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sort' }))
    await waitFor(() =>
      expect(window.api.invoke).toHaveBeenCalledWith(IPC_CHANNELS.GROUPING_PROPOSE, {
        batchId: 'batch-7'
      })
    )
  })
})
