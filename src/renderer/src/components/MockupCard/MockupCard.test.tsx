import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { MockupCard, type MockupCardProps } from './MockupCard'
import { MOCKUP_CARD_CONTRACT } from './MockupCard.types'

describe('MockupCard', () => {
  it.each(variantMatrix(MOCKUP_CARD_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<MockupCard {...(props as MockupCardProps)} />)
    expect(baseElement.querySelector('[data-ds="MockupCard"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<MockupCard />)
    expect(screen.getByText(MOCKUP_CARD_CONTRACT.texts.title)).not.toBeNull()
    expect(screen.getByText(MOCKUP_CARD_CONTRACT.texts.tags)).not.toBeNull()
  })

  it('shows the drop hint only on a group target', () => {
    const { rerender } = render(<MockupCard />)
    expect(screen.queryByText(MOCKUP_CARD_CONTRACT.texts.dropHint)).toBeNull()
    rerender(<MockupCard state="group-target" />)
    expect(screen.getByText(MOCKUP_CARD_CONTRACT.texts.dropHint)).not.toBeNull()
  })

  describe('library', () => {
    it('offers Open in Photoshop and Edit details, never a bare Open or Zoom', () => {
      const onOpenInPhotoshop = vi.fn()
      const onEditDetails = vi.fn()
      render(<MockupCard onOpenInPhotoshop={onOpenInPhotoshop} onEditDetails={onEditDetails} />)
      fireEvent.click(screen.getByRole('button', { name: 'Open in Photoshop' }))
      fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
      expect(onOpenInPhotoshop).toHaveBeenCalledOnce()
      expect(onEditDetails).toHaveBeenCalledOnce()
      expect(screen.queryByRole('button', { name: /^Open$/ })).toBeNull()
      expect(screen.queryByRole('button', { name: /zoom|preview/i })).toBeNull()
    })

    it('shows both hover buttons at the same, smaller size', () => {
      render(<MockupCard />)
      const open = screen.getByRole('button', { name: 'Open in Photoshop' })
      const edit = screen.getByRole('button', { name: 'Edit details' })
      for (const button of [open, edit]) {
        expect(button.className).toContain('py-1 ')
        expect(button.className).not.toContain('py-1.5')
      }
    })

    it('is neutral by default: no +N badge and not starred', () => {
      render(<MockupCard />)
      expect(screen.queryByText(/^\+/)).toBeNull()
      expect(screen.getByRole('button', { name: /^Star / }).getAttribute('aria-pressed')).toBe(
        'false'
      )
    })

    it('shows +N for a pile and nothing for a single', () => {
      const { rerender } = render(<MockupCard variantCount={3} />)
      expect(screen.getByText('+3')).not.toBeNull()
      rerender(<MockupCard variantCount={0} />)
      expect(screen.queryByText(/^\+/)).toBeNull()
    })

    it('stars and unstars from the star button', () => {
      const onToggleFavourite = vi.fn()
      const { rerender } = render(
        <MockupCard title="Mug" favourite={false} onToggleFavourite={onToggleFavourite} />
      )
      fireEvent.click(screen.getByRole('button', { name: 'Star Mug' }))
      expect(onToggleFavourite).toHaveBeenLastCalledWith(true)
      rerender(<MockupCard title="Mug" favourite onToggleFavourite={onToggleFavourite} />)
      fireEvent.click(screen.getByRole('button', { name: 'Remove star from Mug' }))
      expect(onToggleFavourite).toHaveBeenLastCalledWith(false)
    })

    it('opens the card menu from the more button', () => {
      const onMore = vi.fn()
      render(<MockupCard title="Mug" onMore={onMore} />)
      fireEvent.click(screen.getByRole('button', { name: 'More actions for Mug' }))
      expect(onMore).toHaveBeenCalledOnce()
    })
  })

  describe('pending-review', () => {
    it('has one Look it over button and no Edit details', () => {
      const onLookItOver = vi.fn()
      render(<MockupCard variant="pending-review" onLookItOver={onLookItOver} />)
      fireEvent.click(screen.getByRole('button', { name: 'Look it over' }))
      expect(onLookItOver).toHaveBeenCalledOnce()
      expect(screen.queryByRole('button', { name: 'Edit details' })).toBeNull()
      expect(screen.queryByRole('button', { name: /Star|More actions/ })).toBeNull()
    })

    it('shows a status badge only when it has a status to show', () => {
      const { rerender } = render(<MockupCard variant="pending-review" />)
      expect(screen.queryByText('Sniffing…')).toBeNull()
      rerender(<MockupCard variant="pending-review" status="Sniffing…" />)
      expect(screen.getByText('Sniffing…')).not.toBeNull()
      rerender(<MockupCard variant="pending-review" status="Sniffing…" showStatus={false} />)
      expect(screen.queryByText('Sniffing…')).toBeNull()
    })
  })

  describe('trash', () => {
    it('has Restore and Delete for good, and no star or more button', () => {
      const onRestore = vi.fn()
      const onDeleteForever = vi.fn()
      render(<MockupCard variant="trash" onRestore={onRestore} onDeleteForever={onDeleteForever} />)
      fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
      fireEvent.click(screen.getByRole('button', { name: 'Delete for good' }))
      expect(onRestore).toHaveBeenCalledOnce()
      expect(onDeleteForever).toHaveBeenCalledOnce()
      expect(screen.queryByRole('button', { name: /Star|More actions/ })).toBeNull()
    })

    it('says when it was trashed', () => {
      render(<MockupCard variant="trash" trashedAgo="2 days ago" />)
      expect(screen.getByText('Trashed 2 days ago')).not.toBeNull()
    })
  })

  describe('compact', () => {
    it('has an icon-only Open in Photoshop and no Preview', () => {
      const onOpenInPhotoshop = vi.fn()
      render(<MockupCard variant="compact" onOpenInPhotoshop={onOpenInPhotoshop} />)
      fireEvent.click(screen.getByRole('button', { name: 'Open in Photoshop' }))
      expect(onOpenInPhotoshop).toHaveBeenCalledOnce()
      expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull()
    })
  })

  it('keeps Preview off the library hover too', () => {
    render(<MockupCard />)
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit details' })).not.toBeNull()
    expect(screen.getByRole('button', { name: /More actions/ })).not.toBeNull()
  })

  describe('pile look', () => {
    it('stacks two card edges under a card with variants', () => {
      const { container } = render(<MockupCard variantCount={3} />)
      expect(container.querySelectorAll('[data-pile-edge]')).toHaveLength(2)
      expect(container.querySelector('[data-ds="MockupCard"]')!.className).toContain('mb-3')
    })

    it('leaves a single flat', () => {
      const { container } = render(<MockupCard />)
      expect(container.querySelectorAll('[data-pile-edge]')).toHaveLength(0)
      expect(container.querySelector('[data-ds="MockupCard"]')!.className).not.toContain('mb-3')
    })

    it('uses the card spring, the 4:3 cover and the card radii', () => {
      const { container } = render(<MockupCard />)
      const html = container.innerHTML
      expect(html).toContain('ease-card-in')
      expect(html).toContain('ease-card-out')
      expect(html).toContain('aspect-card')
      expect(html).toContain('rounded-card-cover')
    })
  })

  describe('selection', () => {
    it('lets a click on the body reach the grid but keeps button clicks to themselves', () => {
      const onClick = vi.fn()
      const onOpenInPhotoshop = vi.fn()
      const { container } = render(
        <MockupCard mockupId="m1" onClick={onClick} onOpenInPhotoshop={onOpenInPhotoshop} />
      )
      fireEvent.click(container.querySelector('[data-mockup-id="m1"]')!)
      expect(onClick).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getByRole('button', { name: 'Open in Photoshop' }))
      fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
      fireEvent.click(screen.getByRole('button', { name: 'Star Clay iPhone 15 Pro' }))
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('does not open Detail from a double-click or Enter on a button', () => {
      const onDoubleClick = vi.fn()
      const onKeyDown = vi.fn()
      render(<MockupCard onDoubleClick={onDoubleClick} onKeyDown={onKeyDown} />)
      const open = screen.getByRole('button', { name: 'Open in Photoshop' })
      fireEvent.doubleClick(open)
      fireEvent.keyDown(open, { key: 'Enter' })
      expect(onDoubleClick).not.toHaveBeenCalled()
      expect(onKeyDown).not.toHaveBeenCalled()
    })

    it('marks a selected card', () => {
      const { container } = render(<MockupCard state="selected" />)
      expect(container.querySelector('[data-ds="MockupCard"]')!.getAttribute('data-state')).toBe(
        'selected'
      )
    })
  })

  it('is a plain, unfocusable skeleton while loading', () => {
    const { container } = render(<MockupCard state="loading" />)
    const card = container.querySelector('[data-ds="MockupCard"]')!
    expect(card.getAttribute('aria-busy')).toBe('true')
    expect(card.getAttribute('tabindex')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(MOCKUP_CARD_CONTRACT.texts.title)).toBeNull()
  })
})
