import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Dialog } from './Dialog'

const buttons = () => screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)

describe('Dialog', () => {
  it('gives a dialog a Close button, a content area and Confirm', () => {
    render(<Dialog variant="dialog" title="Move your stash?" />)
    expect(screen.getByText('Move your stash?')).toBeTruthy()
    expect(screen.getByText('Content slot')).toBeTruthy()
    expect(buttons()).toEqual(['Close', 'Cancel', 'Confirm'])
  })

  it('gives an alert dialog no Close button and no content area, and a destructive action', () => {
    render(<Dialog variant="alert-dialog" />)
    expect(screen.queryByText('Content slot')).toBeNull()
    expect(buttons()).toEqual(['Cancel', 'Move to Trash'])
  })

  it('shows the description only when asked', () => {
    const { rerender } = render(<Dialog description="What this is for." />)
    expect(screen.getByText('What this is for.')).toBeTruthy()
    rerender(<Dialog description="What this is for." showDescription={false} />)
    expect(screen.queryByText('What this is for.')).toBeNull()
  })
})
