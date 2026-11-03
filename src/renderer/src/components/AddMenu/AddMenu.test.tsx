import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { AddMenu, type AddMenuProps } from './AddMenu'
import { ADD_MENU_CONTRACT } from './AddMenu.types'

describe('AddMenu', () => {
  it.each(variantMatrix(ADD_MENU_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<AddMenu {...(props as AddMenuProps)} />)
    expect(baseElement.querySelector('[data-ds="AddMenu"]')).not.toBeNull()
  })
})

describe('AddMenu behaviour', () => {
  it('says why it is disabled', () => {
    render(<AddMenu disabled />)
    expect(screen.getByText('Import running…')).not.toBeNull()
    expect(
      (screen.getByRole('button', { name: /Add a mockup/ }) as HTMLButtonElement).disabled
    ).toBe(true)
  })

  it('offers files and folder when open, and reports the pick', () => {
    const onAddFiles = vi.fn()
    const onAddFolder = vi.fn()
    render(<AddMenu open onAddFiles={onAddFiles} onAddFolder={onAddFolder} />)
    expect(screen.getByText('or drop PSDs anywhere')).not.toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: /Add folder/ }))
    expect(onAddFolder).toHaveBeenCalledTimes(1)
    expect(onAddFiles).not.toHaveBeenCalled()
  })
})
