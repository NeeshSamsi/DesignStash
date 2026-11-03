import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { PageHeader } from '@renderer/components/PageHeader'
import { TRUNCATED_TOOLTIP_MS, TruncatedText } from './truncated-text'

const widths = (el: HTMLElement, scroll: number, client: number) => {
  Object.defineProperty(el, 'scrollWidth', { value: scroll, configurable: true })
  Object.defineProperty(el, 'clientWidth', { value: client, configurable: true })
}

const hover = async (el: HTMLElement) => {
  fireEvent.pointerMove(el)
  fireEvent.focus(el)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, TRUNCATED_TOOLTIP_MS + 100))
  })
}

describe('TruncatedText', () => {
  it('shows the full text in a tooltip, only when it is cut off', async () => {
    render(<TruncatedText>A very long mockup title</TruncatedText>)
    const text = screen.getByText('A very long mockup title')
    expect(text.className).toContain('truncate')
    widths(text, 100, 100)
    await hover(text)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('opens the tooltip when the text does not fit', async () => {
    render(<TruncatedText>A very long mockup title</TruncatedText>)
    const text = screen.getByText('A very long mockup title')
    widths(text, 240, 100)
    await hover(text)
    expect((await screen.findAllByText('A very long mockup title')).length).toBeGreaterThan(1)
  })
})

describe('PageHeader crumbs', () => {
  it('cuts the parent crumb before the current title, and both can show the full name', () => {
    render(
      <PageHeader current="A pile with a very long title" parent="My Stash" onParent={() => {}} />
    )
    const parent = screen.getByRole('button', { name: 'My Stash' })
    expect(parent.className).toContain('shrink-3')
    expect(screen.getByText('My Stash').className).toContain('truncate')
    expect(screen.getByText('A pile with a very long title').className).toContain('truncate')
  })
})
