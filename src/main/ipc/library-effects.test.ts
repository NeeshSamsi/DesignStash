import { describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '@shared/ipc'
import type { HandlerContext } from './context'

const queue = vi.hoisted(() => ({
  cancel: vi.fn(),
  enqueue: vi.fn(async () => {})
}))
vi.mock('../ai/inference-queue', () => ({
  InferenceQueue: class {
    cancel = queue.cancel
    enqueue = queue.enqueue
  }
}))

import { countsChanged, mockupsArrived, mockupsLeft } from './library-effects'

// A pile (10) with members 11 and 12; 20 is a mockup on its own.
const members: Record<number, number[]> = { 10: [10, 11, 12], 20: [20] }

const makeCtx = () => {
  const push = vi.fn()
  const ctx = {
    repo: {
      collectGroupIds: (id: number) => members[id] ?? [id],
      getInboxCounts: () => ({ toSort: 1, toStash: 0, sniffing: 0, trash: 0 })
    },
    ai: { activeProvider: async () => null },
    push
  } as unknown as HandlerContext
  return { ctx, push }
}

describe('library effects', () => {
  it('cancels a pile together with its members, once each', () => {
    const { ctx } = makeCtx()
    mockupsLeft(ctx, [10, 11, 20])
    expect(queue.cancel).toHaveBeenCalledWith([10, 11, 12, 20])
  })

  it('queues a pile together with its members', () => {
    const { ctx } = makeCtx()
    mockupsArrived(ctx, [10])
    expect(queue.enqueue).toHaveBeenCalledWith([10, 11, 12])
  })

  it('logs a failed enqueue instead of throwing into the caller', async () => {
    const { ctx } = makeCtx()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    queue.enqueue.mockRejectedValueOnce(new Error('boom'))
    expect(() => mockupsArrived(ctx, [20])).not.toThrow()
    await vi.waitFor(() => expect(error).toHaveBeenCalled())
    error.mockRestore()
  })

  it('pushes the counts', () => {
    const { ctx, push } = makeCtx()
    countsChanged(ctx)
    expect(push).toHaveBeenCalledWith(IPC_CHANNELS.INBOX_COUNTS_CHANGED, {
      toSort: 1,
      toStash: 0,
      sniffing: 0,
      trash: 0
    })
  })
})
