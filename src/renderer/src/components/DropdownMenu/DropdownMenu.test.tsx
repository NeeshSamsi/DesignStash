import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { DropdownMenu, type DropdownMenuProps } from './DropdownMenu'
import { DROPDOWN_MENU_CONTRACT } from './DropdownMenu.types'

describe('DropdownMenu', () => {
  it.each(variantMatrix(DROPDOWN_MENU_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<DropdownMenu {...(props as DropdownMenuProps)} />)
    expect(baseElement.querySelector('[data-ds="DropdownMenu"]')).not.toBeNull()
  })
})
