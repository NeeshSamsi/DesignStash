import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MockupCard } from '@renderer/components/MockupCard'
import { TagFilterPopover } from '@renderer/components/TagFilterPopover'
import { matchesFilter, type FilterCategory } from '@renderer/lib/tag-filter'
import { useGridSelection } from '@renderer/hooks/use-grid-selection'
import { DialogFrame } from '@renderer/lib/dialog-shell'
import { MockupGrid, type MockupGridProps } from './MockupGrid'

const IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
const COLUMNS = 3
const CARD_SIZE = 90
const CARD_STEP = 100

/** jsdom has no layout, so lay the cards out on a 3-column, 100px grid by index. */
function stubLayout() {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    const index = IDS.indexOf(this.dataset.mockupId ?? '')
    if (index === -1) return new DOMRect(0, 0, 0, 0)
    return new DOMRect(
      (index % COLUMNS) * CARD_STEP,
      Math.floor(index / COLUMNS) * CARD_STEP,
      CARD_SIZE,
      CARD_SIZE
    )
  })
}

function Harness({
  coverState,
  ...props
}: MockupGridProps & { coverState?: 'cover-missing' | 'no-preview' }) {
  const selection = useGridSelection(IDS)
  return (
    <MockupGrid selection={selection} {...props}>
      {IDS.map((id) => (
        <MockupCard
          key={id}
          mockupId={id}
          title={`Mockup ${id}`}
          tags={`Tags ${id}`}
          // As coverDisplay does: a card with no cover says so instead of 'selected'.
          state={coverState ?? (selection.isSelected(id) ? 'selected' : 'default')}
          {...(id === 'b' ? { pile: { memberCount: 3 } } : {})}
        />
      ))}
    </MockupGrid>
  )
}

/** Counts the grid's live marquee updates. */
function CountingHarness({ onMarquee }: { onMarquee: () => void }) {
  const selection = useGridSelection(IDS)
  const counted = {
    ...selection,
    marquee: (...args: Parameters<typeof selection.marquee>) => {
      onMarquee()
      selection.marquee(...args)
    }
  }
  return (
    <MockupGrid selection={counted}>
      {IDS.map((id) => (
        <MockupCard
          key={id}
          mockupId={id}
          title={`Mockup ${id}`}
          state={selection.isSelected(id) ? 'selected' : 'default'}
        />
      ))}
    </MockupGrid>
  )
}

const card = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLElement>(`[data-mockup-id="${id}"]`)!
const selected = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-state="selected"]')).map(
    (el) => el.dataset.mockupId
  )

describe('Library · grid, selection, loading and empty', () => {
  beforeEach(() => {
    stubLayout()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows just the Add card when the library is empty', () => {
    const { container } = render(<MockupGrid state="empty" />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Add mockup/ })).not.toBeNull()
    expect(container.querySelector('[data-ds="MockupCard"]')).toBeNull()
  })

  it('shows the Add card plus 10 skeleton cards in the real grid while loading', () => {
    const { container } = render(<MockupGrid state="loading" />)
    const cards = container.querySelectorAll('[data-ds="MockupCard"]')
    expect(cards).toHaveLength(10)
    cards.forEach((el) => expect(el.getAttribute('aria-busy')).toBe('true'))
    expect(screen.getByRole('button', { name: /Add mockup/ })).not.toBeNull()
    // Same wrap as the real cards, so nothing jumps when they arrive.
    const wrap = screen.getByRole('button', { name: /Add mockup/ }).parentElement
    expect(wrap?.contains(cards[0] ?? null)).toBe(true)
  })

  it('selects with click, Cmd-click, Shift-click range, marquee and Cmd+A; never the Add card', () => {
    const { container } = render(<Harness />)
    const root = container.querySelector<HTMLElement>('[data-ds="MockupGrid"]')!

    // click
    fireEvent.click(card(container, 'b'))
    expect(selected(container)).toEqual(['b'])
    fireEvent.click(card(container, 'd'))
    expect(selected(container)).toEqual(['d'])

    // Cmd-click toggles
    fireEvent.click(card(container, 'f'), { metaKey: true })
    expect(selected(container)).toEqual(['d', 'f'])
    fireEvent.click(card(container, 'd'), { metaKey: true })
    expect(selected(container)).toEqual(['f'])

    // Shift-click selects the range in grid order
    fireEvent.click(card(container, 'a'))
    fireEvent.click(card(container, 'e'), { shiftKey: true })
    expect(selected(container)).toEqual(['a', 'b', 'c', 'd', 'e'])

    // marquee over the first two columns of rows 1 and 2 (a, b, d, e)
    fireEvent.mouseDown(root, { clientX: 150, clientY: 190, button: 0 })
    fireEvent.mouseMove(window, { clientX: 5, clientY: 5 })
    fireEvent.mouseUp(window)
    expect(selected(container)).toEqual(['a', 'b', 'd', 'e'])

    // Cmd+marquee adds to the selection
    fireEvent.mouseDown(root, { clientX: 5, clientY: 250, button: 0, metaKey: true })
    fireEvent.mouseMove(window, { clientX: 50, clientY: 210 })
    fireEvent.mouseUp(window)
    expect(selected(container)).toEqual(['a', 'b', 'd', 'e', 'g'])

    // Cmd+A selects everything
    fireEvent.click(card(container, 'a'))
    fireEvent.keyDown(card(container, 'a'), { key: 'a', metaKey: true })
    expect(selected(container)).toEqual(IDS)

    // Esc clears
    fireEvent.keyDown(card(container, 'a'), { key: 'Escape' })
    expect(selected(container)).toEqual([])

    // The Add card is never selected: not by click, not by marquee, not by Cmd+A
    const add = screen.getByRole('button', { name: /Add mockup/ })
    fireEvent.click(add)
    expect(selected(container)).toEqual([])
    fireEvent.mouseDown(root, { clientX: 400, clientY: 400, button: 0 })
    fireEvent.mouseMove(window, { clientX: -50, clientY: -50 })
    fireEvent.mouseUp(window)
    expect(selected(container)).toEqual(IDS)
    expect(add.closest('[data-mockup-id]')).toBeNull()
    expect(within(add).queryByText(/selected/i)).toBeNull()
  })

  it('measures the cards once a drag and moves the selection at most once a frame', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    const onMarquee = vi.fn()
    const { container } = render(<CountingHarness onMarquee={onMarquee} />)
    const root = container.querySelector<HTMLElement>('[data-ds="MockupGrid"]')!
    const measure = vi.mocked(HTMLElement.prototype.getBoundingClientRect)
    const cardMeasures = () =>
      measure.mock.contexts.filter((el) => (el as HTMLElement).dataset.mockupId).length
    measure.mockClear()

    fireEvent.mouseDown(root, { clientX: 400, clientY: 400, button: 0 })
    for (let i = 0; i < 100; i++) {
      fireEvent.mouseMove(window, { clientX: 400 - i * 4, clientY: 400 - i * 4 })
    }
    expect(onMarquee).not.toHaveBeenCalled()
    act(() => vi.advanceTimersToNextFrame())
    expect(onMarquee).toHaveBeenCalledOnce()
    expect(cardMeasures()).toBe(IDS.length)
    expect(selected(container)).toEqual(IDS)

    // A scroll moves the cards under the box: they are measured again and the box re-applied.
    fireEvent.scroll(window)
    act(() => vi.advanceTimersToNextFrame())
    expect(cardMeasures()).toBe(IDS.length * 2)
    expect(onMarquee).toHaveBeenCalledTimes(2)

    fireEvent.mouseUp(window)
  })

  it('tells assistive tech which cards are selected and where each one sits', () => {
    const { container } = render(<Harness />)
    const list = screen.getByRole('listbox', { name: 'Mockups' })
    expect(list.getAttribute('aria-multiselectable')).toBe('true')
    const options = within(list).getAllByRole('option')
    expect(options.map((o) => o.getAttribute('aria-posinset'))).toEqual(
      IDS.map((_, i) => String(i + 1))
    )
    options.forEach((o) => expect(o.getAttribute('aria-setsize')).toBe(String(IDS.length)))
    // The name is the card's words, not its buttons'.
    expect(screen.getByRole('option', { name: 'Mockup a, Tags a' })).toBe(card(container, 'a'))
    expect(screen.getByRole('option', { name: 'Mockup b, 3 mockups in this pile, Tags b' })).toBe(
      card(container, 'b')
    )
    expect(screen.queryAllByRole('option', { selected: true })).toHaveLength(0)

    fireEvent.click(card(container, 'c'))
    expect(screen.getByRole('option', { selected: true })).toBe(card(container, 'c'))
    fireEvent.keyDown(card(container, 'c'), { key: 'a', metaKey: true })
    expect(screen.getAllByRole('option', { selected: true })).toHaveLength(IDS.length)
    // The Add card is in the list but is never an option.
    expect(
      within(list)
        .getByRole('button', { name: /Add mockup/ })
        .closest('[role="option"]')
    ).toBeNull()
  })

  it('is not taken for an open menu: a dialog over the grid still closes on an outside press', async () => {
    const onDismiss = vi.fn()
    render(
      <>
        <Harness />
        <DialogFrame open dataDs="Probe" onDismiss={onDismiss}>
          <p>Over the grid</p>
        </DialogFrame>
      </>
    )
    // Radix starts listening for outside presses a tick after the dialog opens.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    const overlay = document.querySelector('[data-slot="dialog-overlay"]')!
    fireEvent.pointerDown(overlay, { button: 0, pointerType: 'mouse' })
    fireEvent.pointerUp(overlay, { button: 0, pointerType: 'mouse' })
    fireEvent.click(overlay)
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('is a plain grid while loading, when empty and without a selection', () => {
    const { rerender } = render(<MockupGrid state="loading" />)
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByRole('option')).toBeNull()
    rerender(<MockupGrid state="empty" />)
    expect(screen.queryByRole('listbox')).toBeNull()
    rerender(
      <MockupGrid>
        <MockupCard mockupId="a" />
      </MockupGrid>
    )
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByRole('option')).toBeNull()
  })

  it.each(['cover-missing', 'no-preview'] as const)(
    'rings a selected card whose cover is %s, and says it is selected',
    (coverState) => {
      const { container } = render(<Harness coverState={coverState} />)
      fireEvent.click(card(container, 'd'))
      expect(card(container, 'd').getAttribute('aria-selected')).toBe('true')
      expect(selected(container)).toEqual(['d'])
      expect(card(container, 'd').querySelector('.ring-selected')).not.toBeNull()
      expect(card(container, 'e').querySelector('.ring-selected')).toBeNull()
      // The cover still says what is wrong with it.
      expect(
        card(container, 'd').querySelector('[data-ds="CoverImage"]')?.getAttribute('data-state')
      ).toBe(coverState === 'cover-missing' ? 'missing-file' : 'no-preview')
    }
  )

  it('does not change the selection from a card button', () => {
    const onOpenInPhotoshop = vi.fn()
    const { container } = render(
      <MockupGrid>
        <MockupCard mockupId="a" onOpenInPhotoshop={onOpenInPhotoshop} />
      </MockupGrid>
    )
    fireEvent.click(within(card(container, 'a')).getByRole('button', { name: 'Open in Photoshop' }))
    expect(onOpenInPhotoshop).toHaveBeenCalledOnce()
  })

  it('keeps the selection when a card button is clicked', () => {
    const { container } = render(<Harness />)
    fireEvent.click(card(container, 'c'))
    fireEvent.click(within(card(container, 'a')).getByRole('button', { name: 'Open in Photoshop' }))
    expect(selected(container)).toEqual(['c'])
  })

  it('clears the selection when empty space is pressed without dragging', () => {
    const { container } = render(<Harness />)
    const root = container.querySelector<HTMLElement>('[data-ds="MockupGrid"]')!
    fireEvent.click(card(container, 'c'))
    fireEvent.mouseDown(root, { clientX: 500, clientY: 500, button: 0 })
    fireEvent.mouseUp(window)
    expect(selected(container)).toEqual([])
  })

  it('moves the selection with arrow keys, and ⇧ extends it', () => {
    const { container } = render(<Harness />)
    fireEvent.click(card(container, 'b'))
    fireEvent.keyDown(card(container, 'b'), { key: 'ArrowRight' })
    expect(selected(container)).toEqual(['c'])
    fireEvent.keyDown(card(container, 'c'), { key: 'ArrowDown' })
    expect(selected(container)).toEqual(['f'])
    fireEvent.keyDown(card(container, 'f'), { key: 'ArrowLeft', shiftKey: true })
    expect(selected(container)).toEqual(['e', 'f'])
    expect(document.activeElement).toBe(card(container, 'e'))
  })

  it('renders the no-results and error slots instead of the cards', () => {
    const { rerender } = render(<MockupGrid state="no-results" noResults={<p>Nothing here</p>} />)
    expect(screen.getByText('Nothing here')).not.toBeNull()
    rerender(<MockupGrid state="error" error={<p>Could not load</p>} />)
    expect(screen.getByText('Could not load')).not.toBeNull()
    expect(screen.queryByRole('button', { name: /Add mockup/ })).toBeNull()
  })

  // The My Stash page behaviour (add card, states, sort, stars, Detail, card menu, trash,
  // piles by drag and shortcut, fullscreen preview) is tested against the page itself, with the
  // same test names, in screens/library/LibraryPage{,.menu,.piles}.test.tsx.
  describe('tag filter', () => {
    const TAGS: FilterCategory[] = [
      {
        categoryId: 1,
        categoryLabel: 'Device',
        tags: [
          { tagId: 10, label: 'iPhone', count: 24 },
          { tagId: 11, label: 'iPad', count: 8 }
        ]
      },
      { categoryId: 2, categoryLabel: 'Style', tags: [{ tagId: 20, label: 'Clay', count: 12 }] },
      { categoryId: 3, categoryLabel: 'Colour', tags: [{ tagId: 30, label: 'Clear', count: 2 }] }
    ]
    const pills = () =>
      within(screen.getByRole('group', { name: 'Narrow by category' }))
        .getAllByRole('button')
        .map((b) => b.textContent)

    it('filters the tag list live in the filter popover and updates category counts', () => {
      render(<TagFilterPopover categories={TAGS} />)
      expect(pills()).toEqual(['All', 'Device2', 'Style1', 'Colour1'])
      fireEvent.change(screen.getByLabelText('Search tags'), { target: { value: 'cl' } })
      expect(screen.queryByText('iPhone')).toBeNull()
      expect(screen.getByText('Clay')).not.toBeNull()
      expect(pills()).toEqual(['All2', 'Style1', 'Colour1'])
    })

    it('narrows the tag list to a category from its pill', () => {
      render(<TagFilterPopover categories={TAGS} />)
      fireEvent.click(screen.getByRole('button', { name: /^Colour/ }))
      expect(screen.getByText('Clear')).not.toBeNull()
      expect(screen.queryByText('iPhone')).toBeNull()
      expect(screen.queryByText('Clay')).toBeNull()
    })

    it('matches every picked tag (AND), and a category filter includes all its tags', () => {
      const byCategory = new Map(TAGS.map((c) => [c.categoryId, c.tags.map((t) => t.tagId)]))
      const pick = (tagIds: number[], categoryIds: number[] = []) => ({ tagIds, categoryIds })
      expect(matchesFilter([10, 20], byCategory, pick([10, 20]))).toBe(true)
      expect(matchesFilter([10], byCategory, pick([10, 20]))).toBe(false)
      expect(matchesFilter([11], byCategory, pick([], [1]))).toBe(true)
      expect(matchesFilter([20], byCategory, pick([], [1]))).toBe(false)
    })
  })
})

describe('MockupGrid layout', () => {
  it('is a responsive card grid that never scrolls sideways, and fills the page so empty space deselects', () => {
    render(
      <MockupGrid state="populated">
        <div>card</div>
      </MockupGrid>
    )
    const grid = document.querySelector('[data-ds="MockupGrid"]')!
    expect(grid.className).toContain('flex-1')
    const cards = grid.firstElementChild!
    expect(cards.className).toContain('grid-cards')
    expect(cards.className).toContain('min-w-0')
  })
})
