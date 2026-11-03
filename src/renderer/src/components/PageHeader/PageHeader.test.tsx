import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { PageHeader, type PageHeaderProps } from './PageHeader'
import { PAGE_HEADER_CONTRACT } from './PageHeader.types'

describe('PageHeader', () => {
  it.each(variantMatrix(PAGE_HEADER_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<PageHeader {...(props as PageHeaderProps)} />)
    expect(baseElement.querySelector('[data-ds="PageHeader"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<PageHeader />)
    for (const text of Object.values<string>(PAGE_HEADER_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
