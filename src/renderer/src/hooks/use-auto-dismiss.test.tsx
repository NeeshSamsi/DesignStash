import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useAutoDismiss } from './use-auto-dismiss'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

describe('useAutoDismiss', () => {
  it('calls back after the time while active', () => {
    const done = vi.fn()
    renderHook(() => useAutoDismiss(true, 6000, done))
    wait(5999)
    expect(done).not.toHaveBeenCalled()
    wait(1)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('does nothing while inactive, and starts when it becomes active', () => {
    const done = vi.fn()
    const { rerender } = renderHook(({ on }) => useAutoDismiss(on, 6000, done), {
      initialProps: { on: false }
    })
    wait(20000)
    expect(done).not.toHaveBeenCalled()
    rerender({ on: true })
    wait(6000)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('hovering pauses it, leaving starts the full time again', () => {
    const done = vi.fn()
    const { result } = renderHook(() => useAutoDismiss(true, 6000, done))
    wait(5000)
    act(() => result.current.onMouseEnter())
    wait(60000)
    expect(done).not.toHaveBeenCalled()
    act(() => result.current.onMouseLeave())
    wait(5999)
    expect(done).not.toHaveBeenCalled()
    wait(1)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('keyboard focus pauses it too', () => {
    const done = vi.fn()
    const { result } = renderHook(() => useAutoDismiss(true, 6000, done))
    act(() => result.current.onFocus())
    wait(60000)
    expect(done).not.toHaveBeenCalled()
    act(() => result.current.onBlur())
    wait(6000)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('stops when it goes inactive or unmounts', () => {
    const done = vi.fn()
    const { rerender, unmount } = renderHook(({ on }) => useAutoDismiss(on, 6000, done), {
      initialProps: { on: true }
    })
    rerender({ on: false })
    wait(10000)
    expect(done).not.toHaveBeenCalled()
    rerender({ on: true })
    unmount()
    wait(10000)
    expect(done).not.toHaveBeenCalled()
  })

  it('always runs the latest callback', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ cb }) => useAutoDismiss(true, 6000, cb), {
      initialProps: { cb: first }
    })
    rerender({ cb: second })
    wait(6000)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
