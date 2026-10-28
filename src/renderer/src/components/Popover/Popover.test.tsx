import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Button } from '@renderer/components/Button'
import { Popover, type PopoverProps } from './Popover'
import { POPOVER_CONTRACT } from './Popover.types'

describe('Popover', () => {
  it.each(variantMatrix(POPOVER_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Popover {...(props as PopoverProps)} />)
    expect(baseElement.querySelector('[data-ds="Popover"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<Popover showDescription />)
    for (const text of Object.values<string>(POPOVER_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('is raised, with a header, a body and a footer split by full-width dividers', () => {
    const { container } = render(
      <Popover
        size="lg"
        title="Your top mockup edits"
        showDescription
        description="Not checked for this variant, so look before you apply."
        footer
        secondary={<Button variant="ghost" size="sm" label="Close" />}
        primary={<Button size="sm" label="Apply here" />}
      >
        <p>The change</p>
      </Popover>
    )
    const panel = container.querySelector('[data-ds="Popover"]')!
    expect(panel.className).toContain('shadow-raised')
    expect(panel.className).toContain('w-96')
    const regions = [...panel.children].map(
      (el) => el.getAttribute('data-slot') ?? el.getAttribute('data-orientation')
    )
    expect(regions).toEqual([
      'popover-header',
      'separator',
      'popover-body',
      'separator',
      'popover-footer'
    ])
    expect(
      screen.getByText('Not checked for this variant, so look before you apply.').className
    ).toContain('text-muted-foreground')
    const footer = panel.querySelector('[data-slot="popover-footer"]')!
    expect([...footer.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'Close',
      'Apply here'
    ])
  })

  it('leaves out the description, the footer and its divider unless asked', () => {
    const { container } = render(<Popover title="Tags" />)
    const panel = container.querySelector('[data-ds="Popover"]')!
    expect(panel.querySelector('[data-slot="popover-footer"]')).toBeNull()
    expect(panel.querySelectorAll('[data-slot="separator"]')).toHaveLength(1)
    expect(screen.queryByText('A short line under the title.')).toBeNull()
  })

  it('one-column: the title row, the content and the footer stack in one padded column, with no dividers', () => {
    const { container } = render(
      <Popover
        layout="one-column"
        title="Tags"
        headerAction={<Button variant="link" size="xs" label="Clear all" />}
        footer
        primary={<Button size="sm" label="Done" />}
      >
        <p>The list</p>
      </Popover>
    )
    const panel = container.querySelector('[data-ds="Popover"]')!
    expect(panel.className.split(' ')).toEqual(expect.arrayContaining(['gap-3', 'p-4']))
    expect([...panel.children].map((el) => el.getAttribute('data-slot') ?? el.tagName)).toEqual([
      'popover-header',
      'P',
      'popover-footer'
    ])
    expect(panel.querySelector('[data-slot="separator"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeTruthy()
  })

  it('one-column: the description sits under the title, in the same column', () => {
    render(<Popover layout="one-column" title="Tags" showDescription description="Pick any." />)
    expect(screen.getByText('Pick any.').className).toContain('text-muted-foreground')
  })

  it('anchored: hangs from its trigger without the trigger opening or closing it', () => {
    const { rerender } = render(
      <Popover
        anchored
        open={false}
        trigger={<button type="button">Apply here</button>}
        title="Edits"
      >
        <p>Body</p>
      </Popover>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Apply here' }))
    expect(screen.queryByText('Body')).toBeNull()
    rerender(
      <Popover anchored open trigger={<button type="button">Apply here</button>} title="Edits">
        <p>Body</p>
      </Popover>
    )
    expect(screen.getByText('Body')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Apply here' }).hasAttribute('aria-expanded')).toBe(
      false
    )
  })
})
