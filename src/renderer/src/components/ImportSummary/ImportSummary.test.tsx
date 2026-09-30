import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ImportSummary, type ImportSummaryProps } from './ImportSummary'
import { IMPORT_SUMMARY_CONTRACT } from './ImportSummary.types'

describe('ImportSummary', () => {
  it.each(variantMatrix(IMPORT_SUMMARY_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ImportSummary {...(props as ImportSummaryProps)} />)
    expect(baseElement.querySelector('[data-ds="ImportSummary"]')).not.toBeNull()
  })
})
