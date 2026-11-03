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

  it('renders the Figma default text', () => {
    render(<Command />)
    for (const text of Object.values<string>(COMMAND_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
