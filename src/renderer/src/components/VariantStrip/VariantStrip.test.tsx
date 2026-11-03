import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { VariantStrip, type VariantStripProps } from './VariantStrip'
import { VARIANT_STRIP_CONTRACT } from './VariantStrip.types'

describe('VariantStrip', () => {
  it.each(variantMatrix(VARIANT_STRIP_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<VariantStrip {...(props as VariantStripProps)} />)
    expect(baseElement.querySelector('[data-ds="VariantStrip"]')).not.toBeNull()
  })
})
