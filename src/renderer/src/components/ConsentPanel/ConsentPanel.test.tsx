import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ConsentPanel, type ConsentPanelProps } from './ConsentPanel'
import { CONSENT_PANEL_CONTRACT } from './ConsentPanel.types'

describe('ConsentPanel', () => {
  it.each(variantMatrix(CONSENT_PANEL_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ConsentPanel {...(props as ConsentPanelProps)} />)
    expect(baseElement.querySelector('[data-ds="ConsentPanel"]')).not.toBeNull()
  })
})
