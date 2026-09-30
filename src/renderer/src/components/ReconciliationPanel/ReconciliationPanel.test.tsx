import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ReconciliationPanel, type ReconciliationPanelProps } from './ReconciliationPanel'
import { RECONCILIATION_PANEL_CONTRACT } from './ReconciliationPanel.types'

describe('ReconciliationPanel', () => {
  it.each(variantMatrix(RECONCILIATION_PANEL_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ReconciliationPanel {...(props as ReconciliationPanelProps)} />)
    expect(baseElement.querySelector('[data-ds="ReconciliationPanel"]')).not.toBeNull()
  })
})
