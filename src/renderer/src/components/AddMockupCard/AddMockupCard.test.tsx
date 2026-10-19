import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AddMockupCard } from './AddMockupCard'

describe('AddMockupCard', () => {
  it('renders the Figma text', () => {
    const { baseElement } = render(<AddMockupCard />)
    expect(baseElement.querySelector('[data-ds="AddMockupCard"]')).not.toBeNull()
    expect(screen.getByText('Add mockup')).not.toBeNull()
    expect(screen.getByText('PSDs or a whole folder')).not.toBeNull()
  })

  it('is a button that fires on click, so Enter works too', () => {
    const onClick = vi.fn()
    render(<AddMockupCard onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: /Add mockup/ }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is never part of the selection model', () => {
    const { container } = render(<AddMockupCard />)
    expect(container.querySelector('[data-mockup-id]')).toBeNull()
  })
})
