import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { SectionHeader, type SectionHeaderProps } from './SectionHeader'
import { SECTION_HEADER_CONTRACT } from './SectionHeader.types'

describe('SectionHeader', () => {
  it.each(variantMatrix(SECTION_HEADER_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<SectionHeader {...(props as SectionHeaderProps)} />)
    expect(baseElement.querySelector('[data-ds="SectionHeader"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<SectionHeader />)
    for (const text of Object.values<string>(SECTION_HEADER_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
