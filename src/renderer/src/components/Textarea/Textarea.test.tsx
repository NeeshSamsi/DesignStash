import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Textarea, type TextareaProps } from './Textarea'
import { TEXTAREA_CONTRACT } from './Textarea.types'

describe('Textarea', () => {
  it.each(variantMatrix(TEXTAREA_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Textarea {...(props as TextareaProps)} />)
    expect(baseElement.querySelector('[data-ds="Textarea"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<Textarea />)
    for (const text of Object.values<string>(TEXTAREA_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('rowRange 4-6 keeps at least four lines and grows to six', () => {
    const { container, rerender } = render(<Textarea />)
    expect(container.querySelector('textarea')?.className).not.toContain('min-h-28')
    rerender(<Textarea rowRange="4-6" />)
    const cls = container.querySelector('textarea')?.className ?? ''
    expect(cls).toContain('min-h-28')
    expect(cls).toContain('max-h-40')
  })
})
