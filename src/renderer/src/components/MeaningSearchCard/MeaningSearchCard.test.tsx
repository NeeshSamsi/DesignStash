import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import {
  MEANING_LOCKED_REASON,
  MeaningSearchCard,
  type MeaningSearchCardProps
} from './MeaningSearchCard'
import { MEANING_SEARCH_CARD_CONTRACT } from './MeaningSearchCard.types'

describe('MeaningSearchCard', () => {
  it.each(variantMatrix(MEANING_SEARCH_CARD_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<MeaningSearchCard {...(props as MeaningSearchCardProps)} />)
    expect(baseElement.querySelector('[data-ds="MeaningSearchCard"]')).not.toBeNull()
  })
})

describe('MeaningSearchCard behaviour', () => {
  const toggle = () => screen.getByRole('switch', { name: 'Download meaning search' })

  it('is a named group with Recommended and the status line', () => {
    render(<MeaningSearchCard status="146 MB" />)
    const group = screen.getByRole('group', { name: 'Meaning search' })
    expect(group.textContent).toContain('Recommended')
    expect(screen.getByRole('status').textContent).toBe('146 MB')
    expect(toggle().getAttribute('aria-describedby')).toBe(screen.getByRole('status').id)
  })

  it('on and off follow the switch, which can be changed', () => {
    const onCheckedChange = vi.fn()
    const { rerender } = render(<MeaningSearchCard state="on" onCheckedChange={onCheckedChange} />)
    expect(toggle().getAttribute('aria-checked')).toBe('true')
    fireEvent.click(toggle())
    expect(onCheckedChange).toHaveBeenCalledWith(false)
    rerender(<MeaningSearchCard state="off" onCheckedChange={onCheckedChange} />)
    expect(toggle().getAttribute('aria-checked')).toBe('false')
    expect(toggle()).not.toHaveProperty('disabled', true)
  })

  it.each(['downloading', 'checking', 'ready', 'failed'] as const)(
    '%s locks the switch on and says why on focus',
    async (state) => {
      render(<MeaningSearchCard state={state} />)
      expect(toggle().getAttribute('aria-checked')).toBe('true')
      expect(toggle()).toHaveProperty('disabled', true)
      fireEvent.focus(toggle().parentElement!)
      expect((await screen.findByRole('tooltip')).textContent).toContain(MEANING_LOCKED_REASON)
    }
  )

  it('drops Recommended once it is ready', () => {
    render(<MeaningSearchCard state="ready" />)
    expect(screen.getByRole('group').textContent).not.toContain('Recommended')
  })

  it('shows each state’s Figma line when no status is passed', () => {
    const { rerender } = render(<MeaningSearchCard state="off" />)
    expect(screen.getByRole('status').textContent).toBe('Off · search matches the words you type')
    rerender(<MeaningSearchCard state="checking" />)
    expect(screen.getByRole('status').textContent).toBe('Checking the download')
  })
})
