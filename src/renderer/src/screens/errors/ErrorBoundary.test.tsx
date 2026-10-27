import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import { installApi } from '../onboarding/test-api'
import { ErrorBoundary, resetRendererErrorReports } from './ErrorBoundary'

afterEach(() => {
  resetRendererErrorReports()
  vi.restoreAllMocks()
})

const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})

/** A rejection the way the window reports one; jsdom has no PromiseRejectionEvent. */
function rejection(reason: unknown): Event {
  return Object.assign(new Event('unhandledrejection'), { reason })
}

describe('ErrorBoundary · reporting', () => {
  it('sends a throw in render to main with its component stack', () => {
    const api = installApi()
    quiet()
    const Boom = () => {
      throw new TypeError('boom')
    }
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
    const sent = api.sent(IPC_CHANNELS.APP_RENDERER_ERROR)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ source: 'render', name: 'TypeError', message: 'boom' })
    expect((sent[0] as { stack?: string }).stack).toContain('boom')
    expect((sent[0] as { componentStack?: string }).componentStack).toContain('Boom')
  })

  it('sends uncaught errors and unhandled rejections from the window', () => {
    const api = installApi()
    render(
      <ErrorBoundary>
        <p>the app</p>
      </ErrorBoundary>
    )
    window.dispatchEvent(new ErrorEvent('error', { error: new RangeError('far'), message: 'far' }))
    window.dispatchEvent(rejection(new Error('later')))
    window.dispatchEvent(rejection('just words'))
    expect(api.sent(IPC_CHANNELS.APP_RENDERER_ERROR)).toEqual([
      expect.objectContaining({ source: 'error', name: 'RangeError', message: 'far' }),
      expect.objectContaining({ source: 'rejection', name: 'Error', message: 'later' }),
      expect.objectContaining({ source: 'rejection', name: 'Error', message: 'just words' })
    ])
  })

  it('sends the same error once, so a loop that keeps throwing does not flood the log', () => {
    const api = installApi()
    render(
      <ErrorBoundary>
        <p>the app</p>
      </ErrorBoundary>
    )
    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new ErrorEvent('error', { error: new Error('again'), message: 'again' }))
    }
    expect(api.sent(IPC_CHANNELS.APP_RENDERER_ERROR)).toHaveLength(1)
  })

  it('stops listening to the window once it is gone', () => {
    const api = installApi()
    const { unmount } = render(
      <ErrorBoundary>
        <p>the app</p>
      </ErrorBoundary>
    )
    unmount()
    // No error object: with no listener left, Vitest would treat one as its own uncaught exception.
    window.dispatchEvent(new ErrorEvent('error', { message: 'after' }))
    expect(api.sent(IPC_CHANNELS.APP_RENDERER_ERROR)).toHaveLength(0)
  })

  it('never throws when main cannot be reached', () => {
    const api = installApi()
    api.invoke.mockImplementation(() => Promise.reject(new Error('no main')))
    quiet()
    const Boom = () => {
      throw new Error('boom')
    }
    expect(() =>
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      )
    ).not.toThrow()
  })
})
