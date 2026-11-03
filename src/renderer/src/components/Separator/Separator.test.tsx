import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Separator, type SeparatorProps } from './Separator'
import { SEPARATOR_CONTRACT } from './Separator.types'

describe('Separator', () => {
  it.each(variantMatrix(SEPARATOR_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Separator {...(props as SeparatorProps)} />)
    expect(baseElement.querySelector('[data-ds="Separator"]')).not.toBeNull()
  })
})
