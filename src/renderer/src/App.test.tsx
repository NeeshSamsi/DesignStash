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
      if (channel === IPC_CHANNELS.IMPORT_START) {
        return { success: true, data: { batchId: '123', items: [], imported: 1, pendingPreview: 0, duplicates: 0, errors: 0, skippedNonPsd: 0 } }
      }
      if (channel === IPC_CHANNELS.GROUPING_PROPOSE) {
        return { success: true, data: { batchId: '123', groups: [], singletons: [] } }
      }
      if (channel === IPC_CHANNELS.APPROVAL_INIT) {
        return { success: true, data: { batchId: '123', items: [] } }
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
    const dropzone = screen.getByRole('main')
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
})
