import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ModelPicker, type ModelPickerProps } from './ModelPicker'
import { MODEL_PICKER_CONTRACT } from './ModelPicker.types'

describe('ModelPicker', () => {
  it.each(variantMatrix(MODEL_PICKER_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ModelPicker {...(props as ModelPickerProps)} />)
    expect(baseElement.querySelector('[data-ds="ModelPicker"]')).not.toBeNull()
  })
})

describe('ModelPicker behaviour', () => {
  it('on shows the models under the switch', () => {
    render(<ModelPicker ai="on" />)
    expect(screen.getByRole('radiogroup')).not.toBeNull()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByText('Qwen 2.5 VL 3B')).not.toBeNull()
  })

  it('off collapses the models and says titles come from file names', () => {
    render(<ModelPicker ai="off" />)
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.getByText('Off for now. Titles will come from file names.')).not.toBeNull()
  })

  it('the switch reports the change', () => {
    const onAiChange = vi.fn()
    render(<ModelPicker ai="on" onAiChange={onAiChange} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onAiChange).toHaveBeenCalledWith(false)
  })
})
