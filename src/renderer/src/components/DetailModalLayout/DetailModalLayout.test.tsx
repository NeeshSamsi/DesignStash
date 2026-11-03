import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { DetailModalLayout, type DetailModalLayoutProps } from './DetailModalLayout'
import { DETAIL_MODAL_LAYOUT_CONTRACT } from './DetailModalLayout.types'

describe('DetailModalLayout', () => {
  it.each(variantMatrix(DETAIL_MODAL_LAYOUT_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<DetailModalLayout {...(props as DetailModalLayoutProps)} />)
    expect(baseElement.querySelector('[data-ds="DetailModalLayout"]')).not.toBeNull()
  })
})
