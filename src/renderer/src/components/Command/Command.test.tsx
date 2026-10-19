import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Command, type CommandProps } from './Command'
import { COMMAND_CONTRACT } from './Command.types'

describe('Command', () => {
  it.each(variantMatrix(COMMAND_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Command {...(props as CommandProps)} />)
    expect(baseElement.querySelector('[data-ds="Command"]')).not.toBeNull()
  })

  it('renders the Figma default text as the search placeholder', () => {
    render(<Command />)
    expect(screen.getByPlaceholderText(COMMAND_CONTRACT.texts.query)).not.toBeNull()
  })

  it('shows the empty and loading messages for those states', () => {
    const { rerender } = render(<Command state="empty" />)
    expect(screen.getByText('No matching tags')).not.toBeNull()
    rerender(<Command state="loading" />)
    expect(screen.getByText('Searching…')).not.toBeNull()
  })
})
