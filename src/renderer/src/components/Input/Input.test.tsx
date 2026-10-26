import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Input, type InputProps } from './Input'
import { INPUT_CONTRACT } from './Input.types'

describe('Input', () => {
  it.each(variantMatrix(INPUT_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Input {...(props as InputProps)} />)
    expect(baseElement.querySelector('[data-ds="Input"]')).not.toBeNull()
  })

  // Figma's `value` text is the input's value, not a text node.
  it('renders the Figma default text', () => {
    render(<Input />)
    for (const text of Object.values<string>(INPUT_CONTRACT.texts)) {
      expect(screen.getByDisplayValue(text)).not.toBeNull()
    }
  })

  describe('writing', () => {
    it('shows an empty field whose “Writing with AI…” placeholder pulses, static with reduced motion', () => {
      render(<Input state="writing" value="phone_side" onChange={() => {}} aria-label="Title" />)
      const field = screen.getByRole('textbox', { name: 'Title' })
      expect((field as HTMLInputElement).value).toBe('')
      expect(field.getAttribute('placeholder')).toBe('Writing with AI…')
      expect(field.getAttribute('aria-busy')).toBe('true')
      expect(field.className).toContain('animate-placeholder-pulse')
      expect(field.className).toContain('motion-reduce:animate-none')
    })

    it('stays a real field: it takes focus, and typing reports what was typed', () => {
      const typed: string[] = []
      render(
        <Input
          state="writing"
          value="phone_side"
          aria-label="Title"
          onChange={(e) => typed.push(e.target.value)}
        />
      )
      const field = screen.getByRole('textbox', { name: 'Title' })
      field.focus()
      expect(document.activeElement).toBe(field)
      fireEvent.change(field, { target: { value: 'S' } })
      expect(typed).toEqual(['S'])
    })

    it('becomes a normal field once typed in, when nothing controls it', () => {
      render(<Input state="writing" aria-label="Title" />)
      const field = screen.getByRole('textbox', { name: 'Title' })
      fireEvent.change(field, { target: { value: 'Side' } })
      expect((field as HTMLInputElement).value).toBe('Side')
      expect(field.hasAttribute('aria-busy')).toBe(false)
      expect(field.className).not.toContain('animate-placeholder-pulse')
    })
  })

  it('ai-filled: the landing tint, as Textarea’s', () => {
    render(<Input state="ai-filled" aria-label="Title" />)
    const field = screen.getByRole('textbox', { name: 'Title' })
    expect(field.getAttribute('data-state')).toBe('ai-filled')
    expect(field.className).toContain('motion-safe:animate-ai-tint')
    expect(field.className).toContain('motion-reduce:animate-ai-tint-hold')
  })
})
