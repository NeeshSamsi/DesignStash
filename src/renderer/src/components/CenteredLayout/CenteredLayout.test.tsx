import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { CenteredLayout, type CenteredLayoutProps } from './CenteredLayout'
import { CENTERED_LAYOUT_CONTRACT } from './CenteredLayout.types'

describe('CenteredLayout', () => {
  it.each(variantMatrix(CENTERED_LAYOUT_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<CenteredLayout {...(props as CenteredLayoutProps)} />)
    expect(baseElement.querySelector('[data-ds="CenteredLayout"]')).not.toBeNull()
  })
})
