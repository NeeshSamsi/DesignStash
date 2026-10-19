import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { CategoryPill, type CategoryPillProps } from './CategoryPill'
import { CATEGORY_PILL_CONTRACT } from './CategoryPill.types'

describe('CategoryPill', () => {
  it.each(variantMatrix(CATEGORY_PILL_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<CategoryPill {...(props as CategoryPillProps)} />)
    expect(baseElement.querySelector('[data-ds="CategoryPill"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<CategoryPill />)
    for (const text of Object.values<string>(CATEGORY_PILL_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
