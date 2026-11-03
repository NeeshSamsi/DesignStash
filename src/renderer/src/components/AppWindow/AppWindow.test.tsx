import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { AppWindow, type AppWindowProps } from './AppWindow'
import { PageBar } from './PageBar'
import { APP_WINDOW_CONTRACT } from './AppWindow.types'

describe('AppWindow', () => {
  it.each(variantMatrix(APP_WINDOW_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<AppWindow {...(props as AppWindowProps)} />)
    expect(baseElement.querySelector('[data-ds="AppWindow"]')).not.toBeNull()
  })
})

describe('AppWindow behaviour', () => {
  it('puts slots in their regions', () => {
    const { baseElement } = render(
      <AppWindow
        search={<div>search</div>}
        sidebar={<div>sidebar</div>}
        header={<div>header</div>}
        page={<div>page</div>}
      />
    )
    const main = baseElement.querySelector('main')!
    expect(main.textContent).toContain('header')
    expect(main.textContent).toContain('page')
    expect(main.textContent).not.toContain('sidebar')
    expect(screen.getByText('search')).not.toBeNull()
  })

  it('scrolls the page edge to edge across the panel, with the page padding inside the scroll area', () => {
    const { baseElement } = render(<AppWindow page={<div>page</div>} />)
    const main = baseElement.querySelector('main')!
    const scroll = baseElement.querySelector<HTMLElement>('[data-slot="page-scroll"]')!
    // The panel pads only its top, so the scroll area and its scrollbar meet the panel's sides and bottom.
    expect(main.className).not.toMatch(/(^|\s)(p|px|pr|pb)-/)
    expect(scroll.className).toContain('overflow-auto')
    expect(scroll.className).not.toMatch(/(^|\s)-?m[rlxb]?-/)
    expect(screen.getByText('page').parentElement!.className).toContain('px-7')
  })

  it('shows the soft scroll edge under the header, unless the page brings its own bar', () => {
    const { baseElement, rerender } = render(<AppWindow page={<div>page</div>} />)
    const edge = baseElement.querySelector('[data-slot="page-edge"]')!
    expect(edge.className).toContain('sticky')
    expect(edge.querySelector('[data-slot="scroll-edge"]')).not.toBeNull()
    // Hidden by CSS once a PageBar is inside the scroll area; the bar carries its own edge.
    expect(edge.className).toContain('group-has-data-page-bar/scroll:hidden')
    rerender(
      <AppWindow
        page={
          <PageBar>
            <div>toolbar</div>
          </PageBar>
        }
      />
    )
    const bar = screen.getByText('toolbar').parentElement!
    expect(bar.hasAttribute('data-page-bar')).toBe(true)
    expect(bar.querySelector('[data-slot="scroll-edge"]')).not.toBeNull()
  })

  it('blurs the scroll edge progressively over an eased fade, and keeps the fade alone under Reduce transparency', () => {
    const { baseElement } = render(<AppWindow page={<div>page</div>} />)
    const edge = baseElement.querySelector('[data-slot="scroll-edge"]')!
    expect(edge.querySelectorAll('.ds-scroll-edge-blur')).toHaveLength(8)
    expect(edge.querySelectorAll('.ds-scroll-edge-fade')).toHaveLength(1)
    const css = readFileSync(join(process.cwd(), 'src/renderer/src/assets/main.css'), 'utf8')
    // Many stops along an ease curve, so the fade has no hard top or visible linear slope.
    const ease = css.match(/--scroll-edge-ease:([^;]+);/)![1]!
    expect(ease.split(',').length).toBeGreaterThanOrEqual(12)
    expect(css).toMatch(
      /prefers-reduced-transparency: reduce\)\s*\{\s*\.ds-scroll-edge-blur\s*\{\s*display: none/
    )
    // Shown only while the bar is stuck, so the first row is never dimmed at the top of the scroll.
    expect(css).toMatch(/scroll-state\(stuck: top\)\s*\{\s*\.ds-scroll-edge > \*\s*\{\s*opacity: 1/)
  })

  it('hides the header when showHeader is off', () => {
    render(<AppWindow showHeader={false} header={<div>header</div>} />)
    expect(screen.queryByText('header')).toBeNull()
  })

  it('renders a dialog in the modal layer, never in the page', () => {
    const { baseElement } = render(
      <AppWindow state="modal-open" dialog={<div>dialog</div>} page={<div>page</div>} />
    )
    const layer = baseElement.querySelector('[data-slot="modal-layer"]')!
    expect(layer.textContent).toContain('dialog')
    expect(baseElement.querySelector('main')!.textContent).not.toContain('dialog')
  })

  it('has no modal layer when idle', () => {
    const { baseElement } = render(<AppWindow />)
    expect(baseElement.querySelector('[data-slot="modal-layer"]')).toBeNull()
  })

  it('shows the drop overlay while dragging', () => {
    const { baseElement, rerender } = render(<AppWindow state="drag-over" />)
    expect(baseElement.querySelector('[data-ds="DropOverlay"]')).not.toBeNull()
    rerender(<AppWindow />)
    expect(baseElement.querySelector('[data-ds="DropOverlay"]')).toBeNull()
  })

  it('gives every column a minimum width: the sidebar never shrinks, the panel yields before anything leaves the screen', () => {
    const { baseElement } = render(
      <AppWindow
        sidebar={<div>sidebar</div>}
        aside={<div>aside</div>}
        asideOpen
        page={<div>page</div>}
      />
    )
    const sidebar = screen.getByText('sidebar').parentElement!
    expect(sidebar.className).toContain('shrink-0')
    expect(sidebar.className).toContain('min-w-44')
    expect(baseElement.querySelector('main')!.className).toContain('min-w-0')
    const aside = baseElement.querySelector('[data-slot="aside"]')!
    expect(aside.className).toContain('shrink-0')
    expect(aside.className).toContain('w-99')
  })
})
