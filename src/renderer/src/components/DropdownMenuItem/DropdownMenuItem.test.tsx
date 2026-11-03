import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { DropdownMenuItem, type DropdownMenuItemProps } from './DropdownMenuItem'
import { DROPDOWN_MENU_ITEM_CONTRACT } from './DropdownMenuItem.types'

describe('DropdownMenuItem', () => {
  it.each(variantMatrix(DROPDOWN_MENU_ITEM_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<DropdownMenuItem {...(props as DropdownMenuItemProps)} />)
    expect(baseElement.querySelector('[data-ds="DropdownMenuItem"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<DropdownMenuItem />)
    for (const text of Object.values<string>(DROPDOWN_MENU_ITEM_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
