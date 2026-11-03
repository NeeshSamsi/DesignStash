import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS, type IpcResult } from '@shared/ipc'

const handlers = vi.hoisted(
  () => new Map<string, (event: unknown, args: unknown) => Promise<unknown>>()
)
const showOpenDialog = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, args: unknown) => Promise<unknown>) =>
      handlers.set(channel, fn)
  },
  dialog: { showOpenDialog }
}))

import { registerDialogHandlers } from './dialog'

beforeEach(() => {
  handlers.clear()
  showOpenDialog.mockReset()
  registerDialogHandlers()
})

describe('the Add menu file picker', () => {
  it('offers PSDs and zips, several at once', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/d/Cap.zip', '/d/a.psd'] })
    const result = (await handlers.get(IPC_CHANNELS.DIALOG_SELECT_PSD_FILES)!(
      null,
      undefined
    )) as IpcResult<{
      paths: string[]
    }>

    expect(result).toEqual({ success: true, data: { paths: ['/d/Cap.zip', '/d/a.psd'] } })
    const [options] = showOpenDialog.mock.calls[0]!
    expect(options.properties).toEqual(expect.arrayContaining(['openFile', 'multiSelections']))
    // A PSB (Large Document Format) is taken like a PSD (H-12).
    expect(options.filters).toEqual([{ name: 'PSDs and zips', extensions: ['psd', 'psb', 'zip'] }])
  })
})
