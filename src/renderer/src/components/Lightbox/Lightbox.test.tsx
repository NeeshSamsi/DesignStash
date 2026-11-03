import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Lightbox, type LightboxProps } from './Lightbox'
import { LIGHTBOX_CONTRACT } from './Lightbox.types'

describe('Lightbox', () => {
  it.each(variantMatrix(LIGHTBOX_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Lightbox {...(props as LightboxProps)} />)
    expect(baseElement.querySelector('[data-ds="Lightbox"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<Lightbox />)
    for (const text of Object.values<string>(LIGHTBOX_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
