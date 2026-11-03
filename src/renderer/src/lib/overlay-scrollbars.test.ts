import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installOverlayScrollbars } from './overlay-scrollbars'

let uninstall: () => void
let area: HTMLElement
let outside: HTMLElement

const geometry = (el: HTMLElement, g: Record<string, number>) => {
  for (const [key, value] of Object.entries(g)) {
    Object.defineProperty(el, key, { value, configurable: true, writable: true })
  }
}

const lane = (axis = 'vertical') =>
  document.querySelector<HTMLElement>(`.ds-scrollbar[data-axis="${axis}"]`)!
const thumb = (axis = 'vertical') => lane(axis).querySelector<HTMLElement>('.ds-scrollbar-thumb')!

const over = (target: Element) =>
  target.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, relatedTarget: null }))
const scroll = (top: number) => {
  area.scrollTop = top
  area.dispatchEvent(new Event('scroll'))
}

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML =
    '<div id="area" style="overflow-y:auto"><p>row</p></div><p id="outside"></p>'
  area = document.getElementById('area')!
  outside = document.getElementById('outside')!
  geometry(area, { clientHeight: 400, scrollHeight: 1000, clientWidth: 300, scrollWidth: 300 })
  uninstall = installOverlayScrollbars()
})

afterEach(() => {
  uninstall()
  vi.useRealTimers()
})

describe('overlay scrollbars', () => {
  it('draws nothing until the area is scrolled or pointed at', () => {
    expect(document.querySelectorAll('.ds-scrollbar')).toHaveLength(0)
  })

  it('pointer over a scroll area slides the gutter in, and away slides it out', () => {
    over(area.firstElementChild!)
    expect(lane().dataset.state).toBe('open')
    over(outside)
    expect(lane().dataset.state).toBe('hidden')
  })

  it('scrolling without the pointer shows the thumb only, gone 800ms after the last scroll', () => {
    scroll(100)
    expect(lane().dataset.state).toBe('thumb')
    vi.advanceTimersByTime(799)
    expect(lane().dataset.state).toBe('thumb')
    scroll(120)
    vi.advanceTimersByTime(799)
    expect(lane().dataset.state).toBe('thumb')
    vi.advanceTimersByTime(1)
    expect(lane().dataset.state).toBe('hidden')
  })

  it('keeps the gutter open while the pointer stays, even after scrolling stops', () => {
    over(area)
    scroll(50)
    vi.advanceTimersByTime(1000)
    expect(lane().dataset.state).toBe('open')
  })

  it('sizes and places the thumb from the scroll position', () => {
    scroll(300) // 300 of a 600 range: halfway
    expect(thumb().style.height).toBe('160px') // 400 * 400 / 1000
    expect(thumb().style.transform).toBe('translate(-50%, 120px)') // half of 400 - 160
    expect(lane().style.height).toBe('400px')
  })

  it('never makes the thumb shorter than 32px', () => {
    geometry(area, { scrollHeight: 100000 })
    scroll(0)
    expect(thumb().style.height).toBe('32px')
  })

  it('does not draw for an area that does not overflow', () => {
    geometry(area, { scrollHeight: 400 })
    over(area)
    scroll(0)
    expect(document.querySelectorAll('.ds-scrollbar')).toHaveLength(0)
  })

  it('grows the thumb under the pointer', () => {
    over(area)
    over(thumb())
    expect(thumb().dataset.state).toBe('hover')
    expect(lane().dataset.state).toBe('open')
    over(lane().querySelector('.ds-scrollbar-track')!)
    expect(thumb().dataset.state).toBe('idle')
    expect(lane().dataset.state).toBe('open')
  })

  it('dragging the thumb scrolls the area and fills the thumb', () => {
    over(area)
    geometry(lane(), { offsetHeight: 400 })
    geometry(thumb(), { offsetHeight: 160 })
    thumb().dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, button: 0, clientY: 100, cancelable: true })
    )
    expect(thumb().dataset.state).toBe('dragging')
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 220 }))
    // 120px of a 240px thumb travel over a 600px range
    expect(area.scrollTop).toBe(300)
    window.dispatchEvent(new MouseEvent('pointerup'))
    expect(thumb().dataset.state).toBe('idle')
  })

  it('clicking the gutter pages toward the click', () => {
    over(area)
    const scrollBy = vi.fn()
    area.scrollBy = scrollBy as unknown as typeof area.scrollBy
    thumb().getBoundingClientRect = () => ({ top: 100, left: 0 }) as DOMRect
    const track = lane().querySelector('.ds-scrollbar-track')!
    track.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, button: 0, clientY: 350, cancelable: true })
    )
    expect(scrollBy).toHaveBeenCalledWith({ top: 400 })
    track.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, button: 0, clientY: 20, cancelable: true })
    )
    expect(scrollBy).toHaveBeenLastCalledWith({ top: -400 })
  })

  it('never takes scrolling over: pointer events on the content are left alone', () => {
    const event = new MouseEvent('pointerdown', { bubbles: true, button: 0, cancelable: true })
    area.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('draws a horizontal bar along the bottom', () => {
    area.style.overflowX = 'auto'
    geometry(area, { clientWidth: 300, scrollWidth: 900 })
    over(area)
    expect(lane('horizontal').dataset.state).toBe('open')
    expect(thumb('horizontal').style.width).toBe('96px') // (300 - 12) * 300 / 900
    expect(lane('horizontal').style.width).toBe('288px')
  })

  it('removes its bars when the area leaves the page, and everything on uninstall', () => {
    over(area)
    area.remove()
    window.dispatchEvent(new Event('resize'))
    expect(document.querySelectorAll('.ds-scrollbar')).toHaveLength(0)
    uninstall()
    expect(document.querySelector('.ds-scrollbar-layer')).toBeNull()
    uninstall = installOverlayScrollbars()
  })
})
