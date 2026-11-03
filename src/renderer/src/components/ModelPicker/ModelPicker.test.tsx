import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ModelPicker, type ModelPickerProps } from './ModelPicker'
import { MODEL_PICKER_CONTRACT } from './ModelPicker.types'

describe('ModelPicker', () => {
  it.each(variantMatrix(MODEL_PICKER_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ModelPicker {...(props as ModelPickerProps)} />)
    expect(baseElement.querySelector('[data-ds="ModelPicker"]')).not.toBeNull()
  })
})
