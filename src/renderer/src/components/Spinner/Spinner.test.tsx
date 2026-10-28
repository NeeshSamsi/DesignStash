import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Spinner } from './Spinner'

describe('Spinner', () => {
  it('is a status named Loading by default', () => {
    render(<Spinner />)
    expect(screen.getByRole('status', { name: 'Loading' }).getAttribute('data-ds')).toBe('Spinner')
  })

  it('takes its own name, for a wait that says what it is', () => {
    render(<Spinner size="sm" aria-label="Working" />)
    expect(screen.getByRole('status', { name: 'Working' })).toBeTruthy()
  })

  it('hides from screen readers beside a label that already says it', () => {
    const { container } = render(<Spinner size="sm" aria-hidden />)
    expect(container.querySelector('[data-ds="Spinner"]')?.getAttribute('aria-hidden')).toBe('true')
    expect(screen.queryByRole('status')).toBeNull()
  })
})
