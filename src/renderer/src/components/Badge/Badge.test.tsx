import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from './Badge'

const badge = () => document.querySelector('[data-ds="Badge"]')!

describe('Badge', () => {
  it('maps Figma’s primary onto the filled style, and passes the status variants through', () => {
    const { rerender } = render(<Badge variant="primary" />)
    expect(badge().className).toContain('bg-primary')
    rerender(<Badge variant="success" />)
    expect(badge().className).toContain('bg-success-weak')
    rerender(<Badge variant="count" />)
    expect(badge().className).toContain('text-tertiary')
  })

  it('shows its label, or its children in place of it', () => {
    const { rerender } = render(<Badge label="3 to review" />)
    expect(screen.getByText('3 to review')).toBeTruthy()
    rerender(<Badge label="3 to review">In sync</Badge>)
    expect(screen.getByText('In sync')).toBeTruthy()
    expect(screen.queryByText('3 to review')).toBeNull()
  })

  it('draws its icon only when asked', () => {
    const { rerender } = render(<Badge />)
    expect(badge().querySelector('svg')).toBeNull()
    rerender(<Badge showIcon />)
    expect(badge().querySelector('svg')).not.toBeNull()
  })
})
