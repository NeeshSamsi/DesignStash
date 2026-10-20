import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useDockStore } from '@renderer/stores/dockStore'
import { usePinnedBar } from './use-pinned-bar'

class FakeObserver {
  static last: FakeObserver | null = null
  constructor(readonly cb: () => void) {
    FakeObserver.last = this
  }
  observe() {}
  disconnect() {}
}

function Page({ top }: { top: number }) {
  const bar = usePinnedBar()
  return (
    <div
      ref={(node) => {
        if (node) node.getBoundingClientRect = () => ({ top }) as DOMRect
        bar(node)
      }}
    />
  )
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeObserver)
  useDockStore.setState({ barTop: null })
})

describe('usePinnedBar', () => {
  it('reports where the bar starts, and clears it when the page leaves', () => {
    const { unmount } = render(<Page top={608} />)
    expect(useDockStore.getState().barTop).toBe(608)
    unmount()
    expect(useDockStore.getState().barTop).toBeNull()
  })

  it('measures again when the window resizes or the bar changes size', () => {
    let top = 608
    function Moving() {
      const bar = usePinnedBar()
      return (
        <div
          ref={(node) => {
            if (node) node.getBoundingClientRect = () => ({ top }) as DOMRect
            bar(node)
          }}
        />
      )
    }
    render(<Moving />)
    top = 560
    window.dispatchEvent(new Event('resize'))
    expect(useDockStore.getState().barTop).toBe(560)
    top = 500
    FakeObserver.last?.cb()
    expect(useDockStore.getState().barTop).toBe(500)
  })
})
