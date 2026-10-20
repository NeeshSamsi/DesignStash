import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import { IPC_CHANNELS } from '@shared/ipc'
import { useLibraryStore } from './stores/libraryStore'
import { useUiStore } from './stores/uiStore'
import { useCopyStore } from './stores/copyStore'

beforeEach(() => {
  useUiStore.setState({ view: 'all', modal: null, settingsOpen: false })
  useCopyStore.getState().reset()
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
      if (channel === IPC_CHANNELS.TAG_TREE) {
        return { success: true, data: { tree: [] } }
      }
      if (channel === IPC_CHANNELS.INTEGRITY_REPORT) {
        return { success: true, data: { found: [], gone: [] } }
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

  it('a drop on My Stash starts a copy', async () => {
    render(<App />)
    // Wait for consent state to resolve so the real app (AppShell) is mounted.
    await screen.findByRole('navigation', { name: 'Primary' })
    const file = new File([''], 'test.psd', { type: 'image/vnd.adobe.photoshop' })
    const drop = new Event('drop', { bubbles: true, cancelable: true }) as Event & {
      dataTransfer: unknown
    }
    drop.dataTransfer = { files: [file], items: [], types: ['Files'] }
    window.dispatchEvent(drop)
    await waitFor(() =>
      expect(window.api.invoke).toHaveBeenCalledWith(IPC_CHANNELS.COPY_START, {
        paths: ['/path/to/test.psd']
      })
    )
    expect(window.api.invoke).not.toHaveBeenCalledWith(IPC_CHANNELS.IMPORT_START, expect.anything())
  })

  it('finishing Look it over re-fetches LIBRARY_LIST', async () => {
    ;(window.api.invoke as ReturnType<typeof vi.fn>).mockImplementation(async (channel: string) => {
      if (channel === IPC_CHANNELS.SETTINGS_GET)
        return {
          success: true,
          data: { libraryRoot: '/lib', onboarded: true, telemetryEnabled: true }
        }
      if (channel === IPC_CHANNELS.INBOX_COUNTS)
        return { success: true, data: { toSort: 1, toStash: 0, sniffing: 0, trash: 0 } }
      if (channel === IPC_CHANNELS.INBOX_LIST)
        return {
          success: true,
          data: {
            items: [
              {
                id: 1,
                title: 'test.psd',
                description: null,
                coverPath: '/t.png',
                coverSource: 'embedded',
                coverMissing: false,
                isGroup: false,
                favourite: false,
                reviewStatus: 'needs_review',
                createdAt: '2026-10-11',
                variantCount: 0,
                topId: null,
                tags: [],
                stage: 'to_sort',
                aiStatus: 'off',
                sizeBytes: 1,
                batchId: 'b1'
              }
            ]
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
      if (channel === IPC_CHANNELS.LOOK_OVER_OPEN)
        return {
          success: true,
          data: {
            units: [
              {
                unitId: 1,
                kind: 'single',
                items: [
                  {
                    mockupId: 1,
                    pileId: null,
                    role: 'single',
                    title: 'Test',
                    description: '',
                    tags: [],
                    touched: false,
                    checked: false,
                    sidecarFileName: null,
                    cover: {
                      path: '/t.png',
                      source: 'embedded',
                      missing: false,
                      width: 4,
                      height: 3
                    }
                  }
                ]
              }
            ],
            resume: null
          }
        }
      if (channel === IPC_CHANNELS.MOCKUP_STASH)
        return {
          success: true,
          data: { ok: true, stashedIds: [1], snapshot: { mockups: [], drafts: [], resume: null } }
        }
      if (channel === IPC_CHANNELS.TAG_TREE) return { success: true, data: { tree: [] } }
      if (channel === IPC_CHANNELS.LIBRARY_LIST) return { success: true, data: { items: [] } }
      if (channel === IPC_CHANNELS.LIBRARY_STATS)
        return { success: true, data: { total: 0, favourites: 0, groups: 0, trashed: 0 } }
      if (channel === IPC_CHANNELS.INTEGRITY_REPORT)
        return { success: true, data: { found: [], gone: [] } }
      return { success: true, data: {} }
    })

    render(<App />)
    await screen.findByRole('navigation', { name: 'Primary' })

    // To sort holds what was copied in; Sort opens the board on its batch
    fireEvent.click(await screen.findByRole('button', { name: /To sort/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sort' }))

    // The Sort board opens on the batch — carry on to Look it over
    const confirmBtn = await screen.findByRole('button', { name: 'Look them over' })
    fireEvent.click(confirmBtn)

    // Look it over opens — stash the single mockup
    const stashBtn = await screen.findByRole('button', { name: 'Stash' })
    fireEvent.click(stashBtn)

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
      if (channel === IPC_CHANNELS.INTEGRITY_REPORT)
        return {
          success: true,
          data: { found: [{ id: 'f1', name: 'lost', sizeBytes: 2048 }], gone: [] }
        }
      if (channel === IPC_CHANNELS.INTEGRITY_IGNORE)
        return { success: true, data: { ignoredIds: ['f1'] } }
      if (channel === IPC_CHANNELS.LIBRARY_LIST) return { success: true, data: { items: [] } }
      if (channel === IPC_CHANNELS.LIBRARY_STATS)
        return { success: true, data: { total: 0, favourites: 0, groups: 0, trashed: 0 } }
      return { success: true, data: {} }
    })

    render(<App />)
    expect(await screen.findByText('Found in your stash folder')).toBeTruthy()
    // The file is listed by name, never by path
    expect(await screen.findByText('lost')).toBeTruthy()
    // Ignoring it resolves the drift; the modal stays until Done
    fireEvent.click(screen.getByRole('button', { name: 'Ignore' }))
    expect(await screen.findByText('All sorted')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => {
      expect(screen.queryByText('All sorted')).toBeNull()
    })
  })

  it('Sort on To sort opens the Sort board for the cards’ import batch', async () => {
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
    expect(await screen.findByRole('application', { name: 'Sort board' })).toBeTruthy()
    expect(window.api.invoke).toHaveBeenCalledWith(IPC_CHANNELS.SORT_BOARD_LOAD, {
      batchId: 'batch-7'
    })
  })
})
