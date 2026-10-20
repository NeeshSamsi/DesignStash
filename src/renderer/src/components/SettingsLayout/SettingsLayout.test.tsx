import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import {
  SettingsGroup,
  SettingsLayout,
  SettingsRow,
  type SettingsLayoutProps
} from './SettingsLayout'
import { SETTINGS_LAYOUT_CONTRACT } from './SettingsLayout.types'

describe('SettingsLayout', () => {
  it.each(variantMatrix(SETTINGS_LAYOUT_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<SettingsLayout {...(props as SettingsLayoutProps)} />)
    expect(baseElement.querySelector('[data-ds="SettingsLayout"]')).not.toBeNull()
  })

  it('lists the five sections and marks the current one like the main sidebar', () => {
    render(<SettingsLayout section="privacy" />)
    const nav = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(Array.from(nav.querySelectorAll('button')).map((b) => b.textContent)).toEqual([
      'My Stash',
      'AI model',
      'Tags',
      'Privacy',
      'About'
    ])
    expect(screen.getByRole('button', { name: 'Privacy' }).getAttribute('aria-current')).toBe(
      'page'
    )
    expect(screen.getByRole('heading', { name: 'Privacy' })).not.toBeNull()
  })

  it('asks for a section change and closes from the ghost ✕', () => {
    const onSectionChange = vi.fn()
    const onClose = vi.fn()
    render(<SettingsLayout onSectionChange={onSectionChange} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'About' }))
    expect(onSectionChange).toHaveBeenCalledWith('about')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows Figma’s sample for each pane', () => {
    const { rerender } = render(<SettingsLayout section="my-stash" />)
    expect(screen.getByText('~/Pictures/DesignStash')).not.toBeNull()
    expect(screen.getByText('In sync')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Empty Trash…' })).not.toBeNull()
    rerender(<SettingsLayout section="ai-model" />)
    expect(screen.getByText('Use on-device AI')).not.toBeNull()
    expect(screen.getByText('Available to download')).not.toBeNull()
    expect(document.querySelectorAll('[data-ds="ModelCard"]')).toHaveLength(2)
    rerender(<SettingsLayout section="about" />)
    expect(screen.getByText('Version 1.0.0 (42)')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Report…' })).not.toBeNull()
  })

  it('puts the usage-data accordion in Privacy, with its switch on', () => {
    render(<SettingsLayout section="privacy" />)
    expect(
      screen
        .getByRole('switch', { name: 'Share anonymous usage data' })
        .getAttribute('aria-checked')
    ).toBe('true')
    expect(screen.getByText('What we never collect')).not.toBeNull()
  })

  it('takes model cards and the tag tree through its slots', () => {
    const { rerender } = render(
      <SettingsLayout section="ai-model" modelQwen25VL3B={<div>my model</div>} />
    )
    expect(screen.getByText('my model')).not.toBeNull()
    rerender(<SettingsLayout section="tags" tagTree={<div>tree here</div>} />)
    expect(screen.getByText('tree here')).not.toBeNull()
  })

  it('shows the screen’s own rows instead of the sample', () => {
    render(
      <SettingsLayout section="about">
        <SettingsGroup>
          <SettingsRow title="Mine" value="a value" />
        </SettingsGroup>
      </SettingsLayout>
    )
    expect(screen.getByText('a value')).not.toBeNull()
    expect(screen.queryByText('Version 1.0.0 (42)')).toBeNull()
  })

  it('keeps every inline button secondary: none is the primary fill', () => {
    const { container } = render(<SettingsLayout section="my-stash" />)
    const pane = container.querySelector('[data-ds="SettingsLayout"] > div:last-child')!
    expect(pane.querySelector('button.bg-primary')).toBeNull()
  })
})
