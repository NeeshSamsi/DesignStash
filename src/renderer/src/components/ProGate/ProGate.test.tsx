import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ProGate, type ProGateProps } from './ProGate'
import { PRO_GATE_CONTRACT } from './ProGate.types'

describe('ProGate', () => {
  it.each(variantMatrix(PRO_GATE_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ProGate {...(props as ProGateProps)} />)
    expect(baseElement.querySelector('[data-ds="ProGate"]')).not.toBeNull()
  })
})
