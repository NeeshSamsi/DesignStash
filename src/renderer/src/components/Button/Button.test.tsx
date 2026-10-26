import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Button, type ButtonProps } from './Button'
import { BUTTON_CONTRACT } from './Button.types'

describe('Button', () => {
  it.each(variantMatrix(BUTTON_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Button {...(props as ButtonProps)} />)
    expect(baseElement.querySelector('[data-ds="Button"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<Button />)
    for (const text of Object.values<string>(BUTTON_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('draws outline-subtle as the quiet outline: a subtle edge, no fill, the input edge on hover', () => {
    render(<Button variant="outline-subtle" label="Filter" />)
    const button = screen.getByRole('button', { name: 'Filter' })
    expect(button.className).toContain('border-subtle')
    expect(button.className).toContain('hover:border-input')
    expect(button.className).not.toMatch(/(^|\s)bg-/)
  })

  it('draws the two small icon sizes at the ui sizes', () => {
    for (const size of ['icon-xs', 'icon-sm'] as const) {
      const { container, unmount } = render(<Button size={size} aria-label="Dismiss" />)
      expect(container.querySelector('button')?.getAttribute('data-size')).toBe(size)
      unmount()
    }
  })
})
