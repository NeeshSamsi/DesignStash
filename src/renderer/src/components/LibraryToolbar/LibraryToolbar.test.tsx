import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { LibraryToolbar, type LibraryToolbarProps } from './LibraryToolbar'
import { LIBRARY_TOOLBAR_CONTRACT } from './LibraryToolbar.types'

describe('LibraryToolbar', () => {
  it.each(variantMatrix(LIBRARY_TOOLBAR_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<LibraryToolbar {...(props as LibraryToolbarProps)} />)
    expect(baseElement.querySelector('[data-ds="LibraryToolbar"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<LibraryToolbar />)
    for (const text of Object.values<string>(LIBRARY_TOOLBAR_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
