import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { AboutPanel, type AboutPanelProps } from './AboutPanel'
import { ABOUT_PANEL_CONTRACT } from './AboutPanel.types'

describe('AboutPanel', () => {
  it.each(variantMatrix(ABOUT_PANEL_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<AboutPanel {...(props as AboutPanelProps)} />)
    expect(baseElement.querySelector('[data-ds="AboutPanel"]')).not.toBeNull()
  })
})
