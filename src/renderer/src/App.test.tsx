import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import App from './App'
import { IPC_CHANNELS } from '@shared/ipc'

beforeEach(() => {
  // Provide a stub preload bridge — jsdom has no real `window.api`.
  window.api = {
    appName: 'DesignStash',
    invoke: vi.fn(async (channel: string) => {
      if (channel === 'app:info') {
        return { success: true, data: { name: 'DesignStash', version: '0.0.0', env: 'test' } }
      }
      if (channel === IPC_CHANNELS.SETTINGS_GET) {
        // onboarded: true so existing tests bypass the first-run disclosure.
        return { success: true, data: { libraryRoot: '/lib', onboarded: true, telemetryEnabled: true } }
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
        return { success: true, data: { batchId: '123', items: [], imported: 1, pendingPreview: 0, duplicates: 0, errors: 0, skippedNonPsd: 0 } }
      }
      if (channel === IPC_CHANNELS.GROUPING_PROPOSE) {
        return { success: true, data: { batchId: '123', groups: [], singletons: [] } }
      }
      if (channel === IPC_CHANNELS.APPROVAL_INIT) {
        return { success: true, data: { batchId: '123', items: [] } }
      }
      if (channel === IPC_CHANNELS.LIBRARY_LIST) {
        return { success: true, data: { items: [] } }
      }
      if (channel === IPC_CHANNELS.LIBRARY_STATS) {
        return { success: true, data: { total: 0, favourites: 0, groups: 0, trashed: 0 } }
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
      if (channel === IPC_CHANNELS.ENTITLEMENTS_SNAPSHOT) {
        return { success: true, data: { tier: 'free', enabled: { 'search.semantic': true, 'app.core': true } } }
      }
      return { success: true, data: { success: true, message: 'pong', timestamp: 0 } }
    }),
    onImportProgress: vi.fn(() => () => {}),
    onAiDownloadProgress: vi.fn(() => () => {}),
    getPathForFile: vi.fn((file) => `/path/to/${file.name}`)
  } as unknown as typeof window.api
})

describe('App', () => {
  it('renders the app title', async () => {
    render(<App />)
    expect(await screen.findByText('DesignStash')).toBeTruthy()
  })

  it('calls IMPORT_START on drop', async () => {
    render(<App />)
    // Wait for consent state to resolve so the real app (not the disclosure) is mounted.
    const dropzone = await screen.findByRole('main')
    const file = new File([''], 'test.psd', { type: 'image/vnd.adobe.photoshop' })
    const dataTransfer = {
      files: [file],
      items: [{
        kind: 'file',
        type: file.type,
        getAsFile: () => file
      }],
      types: ['Files']
    }
    fireEvent.drop(dropzone, { dataTransfer })
    expect(window.api.invoke).toHaveBeenCalledWith(IPC_CHANNELS.IMPORT_START, { paths: ['/path/to/test.psd'] })
  })

  it('shows the first-run disclosure when not onboarded and opting out sets consent off', async () => {
    ;(window.api.invoke as ReturnType<typeof vi.fn>).mockImplementation(async (channel: string) => {
      if (channel === IPC_CHANNELS.SETTINGS_GET) {
        return { success: true, data: { libraryRoot: '/lib', onboarded: false, telemetryEnabled: true } }
      }
      if (channel === IPC_CHANNELS.TELEMETRY_SET_CONSENT) {
        return { success: true, data: { enabled: false } }
      }
      return { success: true, data: {} }
    })

    render(<App />)
    expect(await screen.findByText(/Help improve DesignStash/i)).toBeTruthy()

    fireEvent.click(screen.getByText('No thanks'))
    expect(window.api.invoke).toHaveBeenCalledWith(IPC_CHANNELS.TELEMETRY_SET_CONSENT, {
      enabled: false
    })
  })
})
