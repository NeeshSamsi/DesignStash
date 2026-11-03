import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { PileStep, type PileStepProps } from './PileStep'
import { PILE_STEP_CONTRACT } from './PileStep.types'

describe('PileStep', () => {
  it.each(variantMatrix(PILE_STEP_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<PileStep {...(props as PileStepProps)} />)
    expect(baseElement.querySelector('[data-ds="PileStep"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<PileStep />)
    expect(screen.getByText('Variant · phone_side')).not.toBeNull()
  })

  it('marks done with a neutral tick, current with the page, skipped with a dashed ring', () => {
    const { container, rerender } = render(<PileStep status="done" />)
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('.text-success')).toBeNull()
    rerender(<PileStep status="current" />)
    expect(screen.getByRole('button').getAttribute('aria-current')).toBe('step')
    rerender(<PileStep status="skipped" />)
    expect(container.querySelector('.border-dashed')).not.toBeNull()
  })

  it('draws the connector unless it is the last step', () => {
    const { container, rerender } = render(<PileStep />)
    expect(container.querySelector('[aria-hidden]')).not.toBeNull()
    rerender(<PileStep showConnector={false} />)
    expect(container.querySelector('[aria-hidden]')).toBeNull()
  })

  it('shows the note under the label only when asked, as a tertiary caption', () => {
    const { rerender } = render(<PileStep note="Suggestions on the way" />)
    expect(screen.queryByText('Suggestions on the way')).toBeNull()
    rerender(<PileStep showNote note="Suggestions on the way" />)
    const note = screen.getByText('Suggestions on the way')
    expect(note.className).toContain('type-caption-xs-regular')
    expect(note.className).toContain('text-tertiary')
    expect(
      screen.getByRole('button', {
        name: 'Variant · phone_side',
        description: 'Suggestions on the way'
      })
    ).toBeTruthy()
  })

  it('stretches the connector from under the marker to the next step, so a note never breaks it', () => {
    const { container } = render(<PileStep showNote />)
    const line = container.querySelector('[data-slot="connector"]')!
    expect(line.className).toContain('top-5')
    expect(line.className).toContain('-bottom-2')
  })

  it('is clickable in every status, since everything is a draft', () => {
    const onClick = vi.fn()
    const { rerender } = render(<PileStep status="todo" onClick={onClick} />)
    for (const status of ['done', 'current', 'todo', 'skipped'] as const) {
      rerender(<PileStep status={status} onClick={onClick} />)
      fireEvent.click(screen.getByRole('button'))
    }
    expect(onClick).toHaveBeenCalledTimes(4)
  })
})
