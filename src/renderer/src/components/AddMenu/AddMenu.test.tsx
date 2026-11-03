import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { AddMenu, type AddMenuProps } from './AddMenu'
import { ADD_MENU_CONTRACT } from './AddMenu.types'

describe('AddMenu', () => {
  it.each(variantMatrix(ADD_MENU_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<AddMenu {...(props as AddMenuProps)} />)
    expect(baseElement.querySelector('[data-ds="AddMenu"]')).not.toBeNull()
  })
})
