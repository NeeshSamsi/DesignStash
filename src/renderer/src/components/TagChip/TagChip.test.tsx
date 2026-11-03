import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { variantMatrix } from '@renderer/design-system/matrix'
import { TagChip, type TagChipProps } from './TagChip'
import { TAG_CHIP_CONTRACT } from './TagChip.types'

describe('TagChip', () => {
  it.each(variantMatrix(TAG_CHIP_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<TagChip {...(props as TagChipProps)} />)
    expect(baseElement.querySelector('[data-ds="TagChip"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<TagChip />)
    for (const text of Object.values<string>(TAG_CHIP_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('answers Enter on the add chip like a click', () => {
    const onClick = vi.fn()
    render(<TagChip variant="add" onClick={onClick} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add tag' }), { key: 'Enter' })
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('removes from the ×, dismisses and accepts a suggestion', () => {
    const onRemove = vi.fn()
    const onAccept = vi.fn()
    const onDismiss = vi.fn()
    const { unmount } = render(<TagChip variant="removable" onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove iPhone' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
    unmount()

    const { container } = render(
      <TagChip variant="suggested" onAccept={onAccept} onDismiss={onDismiss} />
    )
    fireEvent.click(container.querySelector('[data-slot="dismiss"]') as HTMLElement)
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onAccept).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Add Device iPhone' }))
    expect(onAccept).toHaveBeenCalledTimes(1)
  })

  it('shows the × always once marked, and “Writing with AI…” pulsing while thinking', () => {
    const marked = render(<TagChip variant="removable" state="marked" />)
    expect(screen.getByRole('button', { name: 'Remove iPhone' }).className).not.toContain('hidden')
    marked.unmount()
    render(<TagChip variant="suggested" state="thinking" />)
    expect(screen.queryByText('iPhone')).toBeNull()
    const writing = screen.getByText('Writing with AI…')
    expect(writing.className).toContain('animate-pulse')
    expect(writing.className).toContain('motion-reduce:animate-none')
  })

  it('removed: a tag an edit takes out, struck and muted, with nothing to press', () => {
    const { container } = render(<TagChip variant="removed" category="Scene" label="Studio" />)
    const chip = container.querySelector('[data-ds="TagChip"]')!
    expect(chip.className).toContain('line-through')
    expect(chip.hasAttribute('tabindex')).toBe(false)
    expect(screen.getByText('Scene').className).toContain('text-tertiary')
    expect(screen.getByText('Studio').className).toContain('text-tertiary')
    expect(screen.queryByRole('button')).toBeNull()
  })
})
