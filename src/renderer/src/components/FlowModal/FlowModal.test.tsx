import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { FlowModal, type FlowModalProps } from './FlowModal'
import { FLOW_MODAL_CONTRACT } from './FlowModal.types'

describe('FlowModal', () => {
  it.each(variantMatrix(FLOW_MODAL_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<FlowModal {...(props as FlowModalProps)} />)
    expect(baseElement.querySelector('[data-ds="FlowModal"]')).not.toBeNull()
  })
})
