import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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

  it('writing: an empty, typeable field whose “Writing with AI…” placeholder pulses', () => {
    const typed: string[] = []
    render(
      <Textarea
        state="writing"
        value="Clay-style iPhone 15 Pro mockup"
        aria-label="Description"
        onChange={(e) => typed.push(e.target.value)}
      />
    )
    const field = screen.getByRole('textbox', { name: 'Description' })
    expect((field as HTMLInputElement).value).toBe('')
    expect(field.getAttribute('placeholder')).toBe('Writing with AI…')
    expect(field.className).toContain('animate-placeholder-pulse')
    expect(field.className).toContain('motion-reduce:animate-none')
    fireEvent.change(field, { target: { value: 'A' } })
    expect(typed).toEqual(['A'])
  })

  it('ai-filled: the primary-weak tint fades over 1.2s, or holds 2s with reduced motion', () => {
    const { container, rerender } = render(<Textarea />)
    const field = () => container.querySelector('textarea')!
    expect(field().className).not.toContain('animate-ai-tint')
    rerender(<Textarea state="ai-filled" />)
    expect(field().className).toContain('motion-safe:animate-ai-tint')
    expect(field().className).toContain('motion-reduce:animate-ai-tint-hold')
  })
})
