import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Toast } from './Toast'

describe('Toast', () => {
  it('action-disabled: Undo is off and the line says why, whatever the description', () => {
    render(
      <Toast variant="success" message="Moved 3 mockups" description="Just now" actionDisabled />
    )
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Changed since. Use ⌘Z')).toBeTruthy()
    expect(screen.queryByText('Just now')).toBeNull()
  })

  it('action-disabled: the line shows even on a toast with no description', () => {
    render(
      <Toast variant="success" message="Moved 3 mockups" showDescription={false} actionDisabled />
    )
    expect(screen.getByText('Changed since. Use ⌘Z')).toBeTruthy()
  })
})
