import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MockupCard } from '@renderer/components/MockupCard'
import { useGridSelection } from '@renderer/hooks/use-grid-selection'
import { MockupGrid } from './MockupGrid'
import { FIRST_CELLS, nextSpan, WINDOW_FROM, windowParts } from './use-card-window'

const layout = { columns: 5, pitch: 100, gap: 10, width: 1000 }

describe('windowParts', () => {
  it('mounts the first cells until the grid is measured', () => {
    expect(windowParts(3000, null, null, null)).toEqual([
      { kind: 'cells', from: 0, to: FIRST_CELLS }
    ])
    expect(windowParts(40, null, null, null)).toEqual([{ kind: 'cells', from: 0, to: 40 }])
  })

  it('mounts the rows in view and stands blocks in for the rest, each a row less its gap', () => {
    expect(windowParts(3000, layout, { start: 10, end: 20 }, null)).toEqual([
      { kind: 'rows', key: 'rows-0', height: 10 * 100 - 10 },
      { kind: 'cells', from: 50, to: 105 },
      { kind: 'rows', key: 'rows-2', height: (600 - 21) * 100 - 10 }
    ])
  })

  it('has no block above the first row or below the last, and ends on a short last row', () => {
    expect(windowParts(23, layout, { start: 0, end: 4 }, null)).toEqual([
      { kind: 'cells', from: 0, to: 23 }
    ])
    expect(windowParts(3001, layout, { start: 598, end: 700 }, null)).toEqual([
      { kind: 'rows', key: 'rows-0', height: 598 * 100 - 10 },
      { kind: 'cells', from: 2990, to: 3001 }
    ])
  })

  it('keeps the cursor’s row, above or below the view', () => {
    expect(windowParts(3000, layout, { start: 10, end: 12 }, 2999)).toEqual([
      { kind: 'rows', key: 'rows-0', height: 990 },
      { kind: 'cells', from: 50, to: 65 },
      { kind: 'rows', key: 'rows-2', height: (599 - 13) * 100 - 10 },
      { kind: 'cells', from: 2995, to: 3000 }
    ])
    expect(windowParts(3000, layout, { start: 10, end: 12 }, 7)).toEqual([
      { kind: 'rows', key: 'rows-0', height: 90 },
      { kind: 'cells', from: 5, to: 10 },
      { kind: 'rows', key: 'rows-2', height: 8 * 100 - 10 },
      { kind: 'cells', from: 50, to: 65 },
      { kind: 'rows', key: 'rows-4', height: (600 - 13) * 100 - 10 }
    ])
    // Inside the view it adds nothing.
    expect(windowParts(3000, layout, { start: 10, end: 12 }, 55)).toHaveLength(3)
  })
})

describe('nextSpan', () => {
  const view = (start: number, end: number) => ({ start, end, screen: 3 })

  it('mounts a screen either side of the view', () => {
    expect(nextSpan(null, view(20, 23), 600)).toEqual({ start: 17, end: 26 })
    expect(nextSpan(null, view(0, 3), 600)).toEqual({ start: 0, end: 6 })
    expect(nextSpan(null, view(597, 599), 600)).toEqual({ start: 594, end: 599 })
  })

  it('holds while every row on screen is mounted, so a nudge from scroll anchoring changes nothing', () => {
    const span = { start: 17, end: 26 }
    expect(nextSpan(span, view(21, 24), 600)).toBe(span)
    expect(nextSpan(span, view(17, 20), 600)).toBe(span)
    expect(nextSpan(span, view(23, 26), 600)).toBe(span)
  })

  it('moves once a row on screen is not mounted, or the list got shorter', () => {
    expect(nextSpan({ start: 17, end: 26 }, view(24, 27), 600)).toEqual({ start: 21, end: 30 })
    expect(nextSpan({ start: 17, end: 26 }, view(16, 19), 600)).toEqual({ start: 13, end: 22 })
    expect(nextSpan({ start: 17, end: 26 }, view(18, 21), 25)).toEqual({ start: 15, end: 24 })
  })
})

const ids = (count: number) => Array.from({ length: count }, (_, i) => `m${i}`)

function Grid({ count, showAdd = false }: { count: number; showAdd?: boolean }) {
  const all = ids(count)
  const selection = useGridSelection(all)
  return (
    <div data-testid="scroller">
      <MockupGrid selection={selection} showAdd={showAdd}>
        {all.map((id) => (
          <MockupCard
            key={id}
            mockupId={id}
            title={id}
            state={selection.isSelected(id) ? 'selected' : 'default'}
          />
        ))}
      </MockupGrid>
    </div>
  )
}

const mountedCards = () => document.querySelectorAll('[data-ds="MockupCard"]')
const blocks = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-grid-rows]')).map((el) =>
    Number.parseFloat(el.style.height)
  )

/**
 * jsdom lays nothing out, so this plays the browser: `columns` columns of 90px-tall cards with a
 * 10px row gap (no Add card), in a 300px scroller scrolled `scrollY` down. Each card sits where its
 * index puts it.
 */
function stubLayout() {
  const view = { scrollY: 0, columns: 5 }
  const realStyle = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
    if (el instanceof HTMLElement && el.dataset.slot === 'mockup-cards')
      return {
        gridTemplateColumns: Array.from({ length: view.columns }, () => '200px').join(' '),
        rowGap: '10px'
      } as never
    if (el instanceof HTMLElement && el.dataset.testid === 'scroller')
      return { overflowY: 'auto' } as never
    return realStyle(el)
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    if (this.dataset.testid === 'scroller') return new DOMRect(0, 0, 1000, 300)
    if (this.dataset.slot === 'mockup-cards') return new DOMRect(0, -view.scrollY, 1000, 60000)
    const index = Number(this.dataset.mockupId?.slice(1))
    if (this.parentElement?.dataset.slot === 'mockup-cards' && !Number.isNaN(index))
      return new DOMRect(0, Math.floor(index / view.columns) * 100 - view.scrollY, 200, 90)
    return new DOMRect(0, 0, 0, 0)
  })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
    this: HTMLElement
  ) {
    return this.dataset.testid === 'scroller' ? 300 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'get').mockImplementation(function (
    this: HTMLElement
  ) {
    return this.dataset.testid === 'scroller' ? view.scrollY : 0
  })
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'set').mockImplementation(function (
    this: HTMLElement,
    value: number
  ) {
    if (this.dataset.testid === 'scroller') view.scrollY = value
  })
  const nextFrame = () => act(() => vi.advanceTimersToNextFrame())
  return {
    view,
    scrollTo(y: number) {
      view.scrollY = y
      fireEvent.scroll(screen.getByTestId('scroller'))
      nextFrame()
    },
    /** The window narrows (the sidebar opens): fewer columns. */
    setColumns(columns: number) {
      view.columns = columns
      fireEvent(window, new Event('resize'))
      nextFrame()
    }
  }
}

describe('MockupGrid · big grids mount only what is near the view', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('mounts fewer than 200 of 3,000 cards, even with nothing laid out', () => {
    render(<Grid count={3000} />)
    expect(mountedCards().length).toBeLessThan(200)
    expect(mountedCards().length).toBeGreaterThan(0)
  })

  it('mounts every card below the threshold, as before', () => {
    render(<Grid count={WINDOW_FROM - 1} />)
    expect(mountedCards()).toHaveLength(WINDOW_FROM - 1)
    expect(blocks()).toEqual([])
  })

  it('mounts the rows on screen and a screen either side, and follows the scroll', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    const layoutView = stubLayout()
    render(<Grid count={3000} />)
    // At the top: rows 0 to 6 (the 300px view, and 300px more below).
    expect(mountedCards()).toHaveLength(7 * 5)
    expect(blocks()).toEqual([(600 - 7) * 100 - 10])

    layoutView.scrollTo(30000)
    const titles = Array.from(mountedCards()).map((el) => el.getAttribute('data-mockup-id'))
    expect(titles[0]).toBe('m1485') // row 297
    expect(titles.at(-1)).toBe('m1534') // row 306
    expect(blocks()).toEqual([297 * 100 - 10, (600 - 307) * 100 - 10])
    // Positions still count the whole list.
    expect(document.querySelector('[data-mockup-id="m1500"]')?.getAttribute('aria-posinset')).toBe(
      '1501'
    )
    expect(document.querySelector('[data-mockup-id="m1500"]')?.getAttribute('aria-setsize')).toBe(
      '3000'
    )
  })

  it('keeps the reader’s place when the columns change, as the sidebar opening does', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    const layoutView = stubLayout()
    render(<Grid count={3000} />)
    layoutView.scrollTo(30020)
    // m1500 starts row 300, 20px above the view's top.
    const first = document.querySelector<HTMLElement>('[data-mockup-id="m1500"]')!
    expect(first.getBoundingClientRect().top).toBe(-20)

    layoutView.setColumns(3)
    // Row 500 now: the same card, still mounted and still 20px above the view's top.
    expect(document.querySelector('[data-mockup-id="m1500"]')).toBe(first)
    expect(first.getBoundingClientRect().top).toBe(-20)
    expect(layoutView.view.scrollY).toBe(50020)

    layoutView.setColumns(5)
    expect(document.querySelector('[data-mockup-id="m1500"]')).toBe(first)
    expect(first.getBoundingClientRect().top).toBe(-20)
    expect(layoutView.view.scrollY).toBe(30020)
  })

  it('keeps the cursor’s card mounted, so the arrow keys and focus reach any card', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    stubLayout()
    render(<Grid count={3000} />)
    const first = document.querySelector<HTMLElement>('[data-mockup-id="m0"]')!
    fireEvent.click(first)
    // ⌘A puts the cursor on the last card, far below the view.
    fireEvent.keyDown(first, { key: 'a', metaKey: true })
    expect(document.querySelector('[data-mockup-id="m2999"]')).not.toBeNull()
    // ← moves the cursor to the one before, and focus follows it.
    fireEvent.keyDown(first, { key: 'ArrowLeft' })
    const target = document.querySelector('[data-mockup-id="m2998"]')
    expect(target).not.toBeNull()
    expect(document.activeElement).toBe(target)
    expect(target?.getAttribute('aria-selected')).toBe('true')
  })

  it('moves ↑ ↓ by the grid’s columns, the Add card included', () => {
    stubLayout()
    render(<Grid count={30} showAdd />)
    const card = (id: string) => document.querySelector<HTMLElement>(`[data-mockup-id="${id}"]`)!
    // The Add card holds the first cell, so m0 sits in column 2 and m5 below it.
    fireEvent.click(card('m0'))
    fireEvent.keyDown(card('m0'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(card('m5'))
  })
})
