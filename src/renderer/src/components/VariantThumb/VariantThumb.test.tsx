import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { VariantThumb, type VariantThumbProps } from './VariantThumb'
import { VARIANT_THUMB_CONTRACT } from './VariantThumb.types'

describe('VariantThumb', () => {
  it.each(variantMatrix(VARIANT_THUMB_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<VariantThumb {...(props as VariantThumbProps)} />)
    expect(baseElement.querySelector('[data-ds="VariantThumb"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<VariantThumb />)
    for (const text of Object.values<string>(VARIANT_THUMB_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
