import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { TitlePair, type TitlePairProps } from './TitlePair'
import { TITLE_PAIR_CONTRACT } from './TitlePair.types'

const base = () => screen.getByRole('textbox', { name: 'Base title' }) as HTMLInputElement
const variation = () => screen.getByRole('textbox', { name: 'Variation' }) as HTMLInputElement

describe('TitlePair', () => {
  it.each(variantMatrix(TITLE_PAIR_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<TitlePair {...(props as TitlePairProps)} />)
    expect(baseElement.querySelector('[data-ds="TitlePair"]')).not.toBeNull()
  })

  it('is the base with the pile icon, a 4px dot in text/secondary, then the 180px variation', () => {
    const { container } = render(<TitlePair baseValue="Clay iPhone 15 Pro" variationValue="side" />)
    expect(base().value).toBe('Clay iPhone 15 Pro')
    expect(base().closest('[data-slot="input-group"]')?.querySelector('svg')).not.toBeNull()
    const dot = container.querySelector('[data-slot="title-pair-dot"]')!
    expect(dot.className).toContain('size-1')
    expect(dot.className).toContain('rounded-full')
    expect(dot.className).toContain('bg-muted-foreground')
    expect(dot.getAttribute('aria-hidden')).toBe('true')
    expect(variation().value).toBe('side')
    expect(variation().className).toContain('w-45')
  })

  it('compact gives the variation 120px, for narrow panels', () => {
    render(<TitlePair size="compact" />)
    expect(variation().className).toContain('w-30')
  })

  it('says what editing the base does, only while it has focus', () => {
    render(<TitlePair pileCount={4} />)
    expect(screen.queryByText('Renames the pile: all 4 mockups.')).toBeNull()
    fireEvent.focus(base())
    const hint = screen.getByText('Renames the pile: all 4 mockups.')
    expect(hint.className).toContain('type-caption-xs-regular')
    expect(hint.className).toContain('text-tertiary')
    expect(base().getAttribute('aria-describedby')).toBe(hint.id)
    fireEvent.blur(base())
    expect(screen.queryByText('Renames the pile: all 4 mockups.')).toBeNull()
  })

  it('suggests 1 to 3 words only in an empty variation', () => {
    render(<TitlePair variationValue="" onVariationChange={() => {}} />)
    expect(variation().getAttribute('placeholder')).toBe('1 to 3 words')
  })

  it('reports edits to either part, and when the variation loses focus', () => {
    const onBaseChange = vi.fn()
    const onVariationChange = vi.fn()
    const onVariationBlur = vi.fn()
    render(
      <TitlePair
        baseValue="Clay iPhone 15 Pro"
        onBaseChange={onBaseChange}
        variationValue="side"
        onVariationChange={onVariationChange}
        onVariationBlur={onVariationBlur}
      />
    )
    fireEvent.change(base(), { target: { value: 'Clay iPhone 16' } })
    fireEvent.change(variation(), { target: { value: '' } })
    fireEvent.blur(variation())
    expect(onBaseChange).toHaveBeenCalledWith('Clay iPhone 16')
    expect(onVariationChange).toHaveBeenCalledWith('')
    expect(onVariationBlur).toHaveBeenCalledOnce()
  })

  it('lets each part take its own state, so only the variation says “Writing with AI…”', () => {
    render(
      <TitlePair
        baseValue="Clay iPhone 15 Pro"
        onBaseChange={() => {}}
        variationValue="phone_side"
        onVariationChange={() => {}}
        variationState="writing"
      />
    )
    expect(base().value).toBe('Clay iPhone 15 Pro')
    expect(variation().value).toBe('')
    expect(variation().getAttribute('placeholder')).toBe('Writing with AI…')
  })
})
