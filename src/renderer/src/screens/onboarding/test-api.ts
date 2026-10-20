import { act } from '@testing-library/react'
import { vi } from 'vitest'

type Handler = (request: unknown) => unknown

export const ok = (data: unknown) => ({ success: true, data })

export interface TestApi {
  invoke: ReturnType<typeof vi.fn>
  /** Requests sent on a channel, in order. */
  sent: (channel: string) => unknown[]
  /** Delivers a main → renderer push event. */
  push: (channel: string, payload: unknown) => void
}

/** `window.api` for the start screens: handlers by channel, a push bus, and unlisted channels succeed. */
export function installApi(handlers: Record<string, Handler> = {}): TestApi {
  const pushes = new Map<string, Set<(payload: unknown) => void>>()
  const invoke = vi.fn(async (channel: string, request: unknown) => {
    const handler = handlers[channel]
    return handler ? handler(request) : ok({})
  })
  window.api = {
    appName: 'DesignStash',
    invoke,
    subscribe: vi.fn((channel: string, cb: (payload: unknown) => void) => {
      const listeners = pushes.get(channel) ?? new Set()
      listeners.add(cb)
      pushes.set(channel, listeners)
      return () => void listeners.delete(cb)
    })
  } as unknown as typeof window.api
  return {
    invoke,
    sent: (channel) => invoke.mock.calls.filter(([c]) => c === channel).map(([, r]) => r),
    push: (channel, payload) => act(() => pushes.get(channel)?.forEach((cb) => cb(payload)))
  }
}
