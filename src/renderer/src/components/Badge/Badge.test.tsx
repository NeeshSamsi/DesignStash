import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Badge, type BadgeProps } from './Badge'
import { BADGE_CONTRACT } from './Badge.types'

describe('Badge', () => {
  it.each(variantMatrix(BADGE_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Badge {...(props as BadgeProps)} />)
    expect(baseElement.querySelector('[data-ds="Badge"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<Badge />)
    for (const text of Object.values<string>(BADGE_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
