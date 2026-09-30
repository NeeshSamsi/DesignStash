import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ScrollArea, type ScrollAreaProps } from './ScrollArea'
import { SCROLL_AREA_CONTRACT } from './ScrollArea.types'

describe('ScrollArea', () => {
  it.each(variantMatrix(SCROLL_AREA_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ScrollArea {...(props as ScrollAreaProps)} />)
    expect(baseElement.querySelector('[data-ds="ScrollArea"]')).not.toBeNull()
  })
})
