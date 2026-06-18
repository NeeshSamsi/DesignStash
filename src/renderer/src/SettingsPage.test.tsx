import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SettingsPage from './SettingsPage'
import { IPC_CHANNELS } from '@shared/ipc'

function setupApi() {
  window.api = {
    appName: 'DesignStash',
    invoke: vi.fn(async (channel: string) => {
      if (channel === IPC_CHANNELS.SETTINGS_GET)
        return { success: true, data: { libraryRoot: '/Users/me/Library/DesignStash', onboarded: true, telemetryEnabled: true } }
      if (channel === IPC_CHANNELS.APP_INFO)
        return { success: true, data: { name: 'DesignStash', version: '1.0.0', env: 'test' } }
      if (channel === IPC_CHANNELS.TELEMETRY_GET_CONSENT)
        return { success: true, data: { enabled: true } }
      if (channel === IPC_CHANNELS.AI_HARDWARE_INFO)
        return { success: true, data: { chip: 'Apple M1', totalMemoryGB: 8, isAppleSilicon: true, recommendedTier: 'small' } }
      if (channel === IPC_CHANNELS.AI_LIST_MODELS)
        return { success: true, data: { models: [] } }
      if (channel === IPC_CHANNELS.TAG_TREE)
        return { success: true, data: { tree: [] } }
      if (channel === IPC_CHANNELS.INTEGRITY_SCAN)
        return { success: true, data: { orphanFiles: [], orphanRecords: [] } }
      return { success: true, data: {} }
    }),
    onImportProgress: vi.fn(() => () => {}),
    onAiDownloadProgress: vi.fn(() => () => {}),
    getPathForFile: vi.fn((f) => `/path/${(f as File).name}`),
  } as unknown as typeof window.api
}

beforeEach(() => {
  setupApi()
})

describe('SettingsPage', () => {
  it('renders all tab labels', () => {
    render(<SettingsPage />)
    expect(screen.getByRole('button', { name: 'Library' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'AI Models' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Privacy' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tags' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'About' })).toBeTruthy()
  })

  it('Library tab shows the library root path', async () => {
    render(<SettingsPage />)
    expect(await screen.findByText('/Users/me/Library/DesignStash')).toBeTruthy()
  })

  it('About tab shows app name and version', async () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'About' }))
    expect(await screen.findByText('Version 1.0.0')).toBeTruthy()
  })

  it('Check Library button calls INTEGRITY_SCAN', async () => {
    render(<SettingsPage />)
    const checkBtn = await screen.findByRole('button', { name: 'Check Library' })
    fireEvent.click(checkBtn)
    expect(window.api.invoke).toHaveBeenCalledWith(IPC_CHANNELS.INTEGRITY_SCAN, undefined)
  })
})
