import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { CoverPanel, type CoverPanelProps } from './CoverPanel'
import { COVER_PANEL_CONTRACT } from './CoverPanel.types'

describe('CoverPanel', () => {
  it.each(variantMatrix(COVER_PANEL_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<CoverPanel {...(props as CoverPanelProps)} />)
    expect(baseElement.querySelector('[data-ds="CoverPanel"]')).not.toBeNull()
  })
})
