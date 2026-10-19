import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MockupCard } from '@renderer/components/MockupCard'
import { useGridSelection } from '@renderer/hooks/use-grid-selection'
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

function Harness(props: MockupGridProps) {
  const selection = useGridSelection(IDS)
  return (
    <MockupGrid selection={selection} {...props}>
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

  it.todo('shows the Add card first in My Stash › All only (not in search, filter or Starred)')
  it.todo('opens the Add menu from the Add card on click or Enter')
  it.todo('keeps no-results and error states at the top under the toolbar')
  it.todo(
    'offers Clear search, Clear filters or Clear search and filters depending on what is active'
  )
  it.todo('filters the tag list live in the filter popover and updates category counts')
  it.todo('narrows the tag list to a category from its pill')
  it.todo('matches every picked tag (AND), and a category filter includes all its tags')
  it.todo('sorts by date added (newest first) by default, or by name')
  it.todo('keeps an unstarred card in Starred until the view is left, with Undo')
  it.todo('opens Detail on double-click or Enter, not on a single click')
  it.todo(
    'makes a pile by dropping a card or selection on a card (target goes on top) or with Cmd+G, undoable'
  )
  it.todo('adds to or merges into a pile when dropped on one')
  it.todo('disbands a pile instantly with Shift+Cmd+G, leaving the mockups selected')
  it.todo('opens the same menu from right-click and the hover more button')
  it.todo(
    'shows Open in Photoshop and Edit details along the cover on hover; Edit details opens Detail'
  )
  it.todo('moves to Trash instantly with Undo from the menu, Cmd+Backspace or Backspace')
  it.todo(
    'opens the fullscreen preview from Space or Preview in the card menu and steps with arrow keys in grid order'
  )
  it.todo('returns focus to the card when the fullscreen preview closes')
})
