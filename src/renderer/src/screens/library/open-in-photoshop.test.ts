import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '@shared/ipc'
import { openInPhotoshop } from './open-in-photoshop'

const shown = vi.hoisted(() => [] as string[])
vi.mock('@renderer/stores/toastStore', () => ({
  toast: (options: { message: string }) => void shown.push(options.message)
}))
const messages = () => shown

function answer(result: () => Promise<unknown>) {
  const invoke = vi.fn(result)
  window.api = { invoke } as unknown as typeof window.api
  return invoke
}

beforeEach(() => void (shown.length = 0))

describe('openInPhotoshop', () => {
  it('asks the main process for the mockup and says nothing on success', async () => {
    const invoke = answer(async () => ({ success: true, data: { opened: true } }))
    await openInPhotoshop({ id: 4 })
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL, { mockupId: 4 })
    expect(messages()).toEqual([])
  })

  it('says Photoshop is missing', async () => {
    answer(async () => ({ success: true, data: { opened: false, reason: 'no-app' } }))
    await openInPhotoshop({ id: 4 })
    expect(messages()).toEqual(['Photoshop isn’t installed on this Mac.'])
  })

  it('tells the person when the call itself fails (success:false)', async () => {
    answer(async () => ({ success: false, error: 'boom' }))
    await openInPhotoshop({ id: 4 })
    expect(messages()).toEqual(['Couldn’t open this in Photoshop. Try again.'])
  })

  it('tells the person when the call throws', async () => {
    answer(async () => {
      throw new Error('gone')
    })
    await openInPhotoshop({ id: 4 })
    expect(messages()).toEqual(['Couldn’t open this in Photoshop. Try again.'])
  })
})
