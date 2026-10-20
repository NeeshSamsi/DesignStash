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

  it('shows the × always once marked, and no label while thinking', () => {
    const { container, unmount } = render(<TagChip variant="removable" state="marked" />)
    expect(screen.getByRole('button', { name: 'Remove iPhone' }).className).not.toContain('hidden')
    unmount()
    render(<TagChip variant="suggested" state="thinking" />)
    expect(screen.queryByText('iPhone')).toBeNull()
    expect(container).toBeTruthy()
  })
})
