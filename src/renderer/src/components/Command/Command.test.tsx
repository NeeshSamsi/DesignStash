import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Command, CommandItem, type CommandProps } from './Command'
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

  it('list: its rows alone, with no input and no panel, and the active row the caller says', () => {
    const onActiveChange = vi.fn()
    const { container } = render(
      <Command
        variant="list"
        active="tag:2"
        onActiveChange={onActiveChange}
        items={
          <>
            <CommandItem value="tag:1">Clay</CommandItem>
            <CommandItem value="tag:2">Pad</CommandItem>
          </>
        }
      />
    )
    expect(screen.queryByRole('combobox')).toBeNull()
    const root = container.querySelector('[data-ds="Command"]')!
    expect(root.className.split(' ')).toEqual(
      expect.arrayContaining(['border-0', 'rounded-none', 'bg-transparent'])
    )
    expect(screen.getByRole('option', { name: 'Pad' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.pointerMove(screen.getByRole('option', { name: 'Clay' }))
    expect(onActiveChange).toHaveBeenCalledWith('tag:1')
  })

  it('shows the empty and loading messages for those states', () => {
    const { rerender } = render(<Command state="empty" />)
    expect(screen.getByText('No matching tags')).not.toBeNull()
    rerender(<Command state="loading" />)
    expect(screen.getByText('Searching…')).not.toBeNull()
  })
})
