import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ModelRow, type ModelRowProps } from './ModelRow'
import { MODEL_ROW_CONTRACT } from './ModelRow.types'

describe('ModelRow', () => {
  it.each(variantMatrix(MODEL_ROW_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ModelRow {...(props as ModelRowProps)} />)
    expect(baseElement.querySelector('[data-ds="ModelRow"]')).not.toBeNull()
  })
})
