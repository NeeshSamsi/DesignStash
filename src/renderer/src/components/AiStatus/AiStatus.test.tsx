import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Button } from '@renderer/components/Button'
import { AiStatus, type AiStatusProps } from './AiStatus'
import { AI_STATUS_CONTRACT } from './AiStatus.types'

const row = (container: HTMLElement) => container.querySelector('[data-ds="AiStatus"]')!

describe('AiStatus', () => {
  it.each(variantMatrix(AI_STATUS_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<AiStatus {...(props as AiStatusProps)} />)
    expect(baseElement.querySelector('[data-ds="AiStatus"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<AiStatus />)
    for (const text of Object.values<string>(AI_STATUS_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('is one 24px status line of secondary caption text that never wraps', () => {
    const { container } = render(<AiStatus message="Writing with AI…" showAction={false} />)
    expect(row(container).getAttribute('role')).toBe('status')
    expect(row(container).className).toContain('h-6')
    const message = screen.getByText('Writing with AI…')
    expect(message.className).toContain('type-caption-xs-regular')
    expect(message.className).toContain('text-muted-foreground')
    expect(message.className).toContain('truncate')
  })

  it.each([
    ['working', 'spinner'],
    ['done', 'done'],
    ['off', 'off'],
    ['failed', 'failed']
  ] as const)('marks %s with its icon', (kind, icon) => {
    const { container } = render(<AiStatus kind={kind} showAction={false} />)
    expect(container.querySelector(`[data-icon="${icon}"]`)).not.toBeNull()
  })

  it('draws the failed alert in the warning colour', () => {
    const { container } = render(<AiStatus kind="failed" showAction={false} />)
    expect(container.querySelector('[data-icon="failed"]')!.getAttribute('class')).toContain(
      'text-warning'
    )
  })

  it('lays out the lighter action left of the heavier one, then the ×', () => {
    const onDismiss = vi.fn()
    render(
      <AiStatus
        kind="off"
        message="Use your top mockup edits here too?"
        secondaryAction
        secondary={<Button variant="ghost" size="xs" label="Later" />}
        action={<Button variant="secondary" size="xs" label="Apply here" />}
        dismissible
        onDismiss={onDismiss}
      />
    )
    expect(
      screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    ).toEqual(['Later', 'Apply here', 'Dismiss'])
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('shows an action only when its boolean is on', () => {
    render(
      <AiStatus
        showAction={false}
        secondary={<Button variant="ghost" size="xs" label="Later" />}
        action={<Button size="xs" label="Fill it myself" />}
      />
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('none keeps the row at its height with nothing in it', () => {
    const { container } = render(<AiStatus kind="none" />)
    expect(row(container).className).toContain('h-6')
    expect(screen.queryByText('Writing with AI…')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('after a message, none fades its text out and takes the actions away at once', () => {
    const { container, rerender } = render(
      <AiStatus kind="done" message="AI filled in the description and tags." showAction={false} />
    )
    rerender(<AiStatus kind="none" message="AI filled in the description and tags." />)
    const fading = container.querySelector('[data-slot="ai-status-content"]')!
    expect(fading.className).toContain('opacity-0')
    expect(fading.className).toContain('transition-opacity')
    expect(fading.className).toContain('motion-reduce:transition-none')
    expect(fading.getAttribute('aria-hidden')).toBe('true')
    expect(screen.queryByRole('button')).toBeNull()
  })
})
