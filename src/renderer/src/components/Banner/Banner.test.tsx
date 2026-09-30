import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Banner, type BannerProps } from './Banner'
import { BANNER_CONTRACT } from './Banner.types'

describe('Banner', () => {
  it.each(variantMatrix(BANNER_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Banner {...(props as BannerProps)} />)
    expect(baseElement.querySelector('[data-ds="Banner"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<Banner />)
    for (const text of Object.values<string>(BANNER_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
