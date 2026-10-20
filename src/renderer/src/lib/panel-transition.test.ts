import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CARD_TRANSITION_PREFIX,
  nameVisibleCards,
  panelTransition,
  type TransitionDocument
} from './panel-transition'

const rect = (over: Partial<DOMRect>): DOMRect =>
  ({ top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100, ...over }) as DOMRect

function card(id: string, box: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('div')
  el.dataset.mockupId = id
  el.getBoundingClientRect = () => rect(box)
  return el
}

function fakeDoc(cards: HTMLElement[], withApi: boolean) {
  const main = document.createElement('main')
  main.getBoundingClientRect = () => rect({ top: 0, left: 0, right: 800, bottom: 600 })
  let finish: () => void = () => {}
  const skip = vi.fn()
  const start = vi.fn((update: () => void) => {
    update()
    return {
      finished: new Promise<void>((resolve) => (finish = resolve)),
      skipTransition: skip
    }
  })
  const doc = {
    documentElement: document.createElement('html'),
    querySelectorAll: (selector: string) =>
      (selector === 'main' ? [main] : selector === '[data-mockup-id]' ? cards : []) as never,
    ...(withApi ? { startViewTransition: start } : {})
  } as unknown as TransitionDocument
  return { doc, start, skip, finish: () => finish() }
}

afterEach(() => vi.restoreAllMocks())

describe('nameVisibleCards', () => {
  it('names the cards on screen and leaves the others out', () => {
    const inView = card('1', { top: 10, bottom: 110, left: 10, right: 110 })
    const below = card('2', { top: 900, bottom: 1000, left: 10, right: 110 })
    const { doc } = fakeDoc([inView, below], true)
    const undo = nameVisibleCards(doc, rect({ top: 0, left: 0, right: 800, bottom: 600 }))
    expect(inView.style.getPropertyValue('view-transition-name')).toBe(`${CARD_TRANSITION_PREFIX}1`)
    expect(below.style.getPropertyValue('view-transition-name')).toBe('')
    undo()
    expect(inView.style.getPropertyValue('view-transition-name')).toBe('')
  })
})

describe('panelTransition', () => {
  it('runs the change at once when the browser has no View Transitions', () => {
    const { doc } = fakeDoc([], false)
    const apply = vi.fn()
    panelTransition(apply, 'open', { doc })
    expect(apply).toHaveBeenCalledOnce()
    expect(doc.documentElement.dataset.panelMotion).toBeUndefined()
  })

  it('runs the change at once, with no transition, under reduced motion', () => {
    const { doc, start } = fakeDoc([], true)
    const apply = vi.fn()
    panelTransition(apply, 'close', { doc, reduced: true })
    expect(apply).toHaveBeenCalledOnce()
    expect(start).not.toHaveBeenCalled()
  })

  it('wraps the change in a view transition, names the visible cards, and cleans up after', async () => {
    const one = card('7', { top: 10, bottom: 110, left: 10, right: 110 })
    const { doc, start, finish } = fakeDoc([one], true)
    const apply = vi.fn()
    panelTransition(apply, 'open', { doc })
    expect(start).toHaveBeenCalledOnce()
    expect(apply).toHaveBeenCalledOnce()
    expect(doc.documentElement.dataset.panelMotion).toBe('open')
    expect(one.style.getPropertyValue('view-transition-name')).toBe('card-7')

    finish()
    await Promise.resolve()
    await Promise.resolve()
    expect(doc.documentElement.dataset.panelMotion).toBeUndefined()
    expect(one.style.getPropertyValue('view-transition-name')).toBe('')
  })

  it('skips a running transition when another toggle arrives, and still applies both', () => {
    const { doc, start, skip } = fakeDoc([], true)
    const first = vi.fn()
    const second = vi.fn()
    panelTransition(first, 'open', { doc })
    panelTransition(second, 'close', { doc })
    expect(skip).toHaveBeenCalledOnce()
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
    expect(start).toHaveBeenCalledTimes(2)
    expect(doc.documentElement.dataset.panelMotion).toBe('close')
  })
})
