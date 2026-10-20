import { afterEach, describe, expect, it, vi } from 'vitest'
import { guardToaster, isInsideToaster } from './toast-layer'

afterEach(() => void (document.body.innerHTML = ''))

function mount(html: string) {
  document.body.innerHTML = html
  return document.body
}

describe('isInsideToaster', () => {
  it('is true for the toaster, the dock and anything in them', () => {
    const body = mount(
      '<div data-ds="ActivityDock"><ol data-sonner-toaster><li><button id="undo">Undo</button></li></ol></div><p id="other"></p>'
    )
    expect(isInsideToaster(body.querySelector('#undo'))).toBe(true)
    expect(isInsideToaster(body.querySelector('[data-sonner-toaster]'))).toBe(true)
    expect(isInsideToaster(body.querySelector('#other'))).toBe(false)
    expect(isInsideToaster(null)).toBe(false)
  })
})

describe('guardToaster', () => {
  const event = (target: EventTarget | null, viaDetail = true) => ({
    target: viaDetail ? document.body : target,
    detail: viaDetail ? { originalEvent: { target } as unknown as Event } : {},
    preventDefault: vi.fn()
  })

  it('stops a dismiss from a press on a toast, whichever field carries the target', () => {
    const body = mount('<div data-sonner-toaster><button id="undo"></button></div>')
    const next = vi.fn()
    for (const viaDetail of [true, false]) {
      const e = event(body.querySelector('#undo'), viaDetail)
      guardToaster(next)(e)
      expect(e.preventDefault).toHaveBeenCalledTimes(1)
    }
    expect(next).not.toHaveBeenCalled()
  })

  it('passes other presses on to the dialog’s own handler', () => {
    const body = mount('<p id="other"></p>')
    const next = vi.fn()
    const e = event(body.querySelector('#other'))
    guardToaster(next)(e)
    expect(next).toHaveBeenCalledWith(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('works without a next handler', () => {
    const body = mount('<p id="other"></p>')
    expect(() => guardToaster()(event(body.querySelector('#other')))).not.toThrow()
  })
})
