import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { AppWindow, type AppWindowProps } from './AppWindow'
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

  it('pads the page scroller on the right so the hover scrollbar stays off the last column', () => {
    render(<AppWindow page={<div>page</div>} />)
    const scroller = screen.getByText('page').parentElement!
    expect(scroller.className).toContain('pr-3')
    expect(scroller.className).toContain('-mr-3')
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
