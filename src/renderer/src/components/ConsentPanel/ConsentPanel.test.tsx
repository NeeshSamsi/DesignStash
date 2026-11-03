import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ConsentPanel, type ConsentPanelProps } from './ConsentPanel'
import { CONSENT_PANEL_CONTRACT } from './ConsentPanel.types'

const ticks = (container: HTMLElement) => container.querySelectorAll('li svg.text-success')
const crosses = (container: HTMLElement) => container.querySelectorAll('li svg.text-error')

describe('ConsentPanel', () => {
  it.each(variantMatrix(CONSENT_PANEL_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ConsentPanel {...(props as ConsentPanelProps)} />)
    expect(baseElement.querySelector('[data-ds="ConsentPanel"]')).not.toBeNull()
  })

  describe('card (onboarding)', () => {
    it('lists what we collect with green ticks and what we never collect with red crosses', () => {
      const { container } = render(<ConsentPanel />)
      expect(screen.getByText('What we collect')).not.toBeNull()
      expect(screen.getByText('What we never collect')).not.toBeNull()
      expect(ticks(container)).toHaveLength(3)
      expect(crosses(container)).toHaveLength(3)
      expect(screen.getByText('Crash reports')).not.toBeNull()
      expect(screen.getByText('Anything that identifies you')).not.toBeNull()
    })

    it('offers two neutral answers of equal weight', () => {
      const onDecline = vi.fn()
      const onAccept = vi.fn()
      render(<ConsentPanel onDecline={onDecline} onAccept={onAccept} />)
      fireEvent.click(screen.getByRole('button', { name: 'Don’t share' }))
      fireEvent.click(screen.getByRole('button', { name: 'Share usage data' }))
      expect(onDecline).toHaveBeenCalledOnce()
      expect(onAccept).toHaveBeenCalledOnce()
      const share = screen.getByRole('button', { name: 'Share usage data' })
      const decline = screen.getByRole('button', { name: 'Don’t share' })
      expect(share.className).not.toContain('bg-primary')
      expect(decline.className).toBe(share.className)
    })

    it('with an onEnabledChange it shows the on-by-default switch instead of two buttons', () => {
      const onEnabledChange = vi.fn()
      render(<ConsentPanel enabled onEnabledChange={onEnabledChange} />)
      expect(screen.queryByRole('button', { name: 'Share usage data' })).toBeNull()
      const toggle = screen.getByRole('switch', { name: 'Share anonymous usage data' })
      expect(toggle.getAttribute('aria-checked')).toBe('true')
      fireEvent.click(toggle)
      expect(onEnabledChange).toHaveBeenCalledWith(false)
    })

    it('says it is anonymous and can be changed', () => {
      render(<ConsentPanel />)
      expect(screen.getByText('Help improve DesignStash')).not.toBeNull()
      expect(
        screen.getByText('Just anonymous usage data. Change your mind any time.')
      ).not.toBeNull()
    })
  })

  describe('accordion (Settings › Privacy)', () => {
    it('is headed by its switch and opens the same lists underneath while on', () => {
      const { container } = render(<ConsentPanel mode="accordion" enabled />)
      const toggle = screen.getByRole('switch', { name: 'Share anonymous usage data' })
      expect(toggle.getAttribute('aria-checked')).toBe('true')
      expect(ticks(container)).toHaveLength(3)
      expect(crosses(container)).toHaveLength(3)
      expect(screen.queryByRole('button', { name: 'Share usage data' })).toBeNull()
    })

    it('still shows what is collected when it is off', () => {
      const { container } = render(<ConsentPanel mode="accordion" enabled={false} />)
      expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
      expect(screen.getByText('What we collect')).not.toBeNull()
      expect(screen.getByText('What we never collect')).not.toBeNull()
      expect(ticks(container)).toHaveLength(3)
      expect(screen.getByText(/Sharing is off, so none of this is sent/)).not.toBeNull()
      expect(container.querySelector('[data-ds="ConsentPanel"]')?.getAttribute('data-state')).toBe(
        'off'
      )
    })

    it('reports the switch so the caller can stop sending at once', () => {
      const onEnabledChange = vi.fn()
      render(<ConsentPanel mode="accordion" enabled onEnabledChange={onEnabledChange} />)
      fireEvent.click(screen.getByRole('switch'))
      expect(onEnabledChange).toHaveBeenCalledWith(false)
    })
  })
})
