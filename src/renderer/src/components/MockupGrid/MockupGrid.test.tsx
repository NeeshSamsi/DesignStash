import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { MockupGrid, type MockupGridProps } from './MockupGrid'
import { MOCKUP_GRID_CONTRACT } from './MockupGrid.types'

describe('MockupGrid', () => {
  it.each(variantMatrix(MOCKUP_GRID_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<MockupGrid {...(props as MockupGridProps)} />)
    expect(baseElement.querySelector('[data-ds="MockupGrid"]')).not.toBeNull()
  })
})
