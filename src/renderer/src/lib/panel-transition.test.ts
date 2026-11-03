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

function fakeDoc(
  cards: HTMLElement[],
  withApi: boolean,
  layers: Record<string, HTMLElement> = {},
  underPointer: Element | null = null
) {
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
      (selector === 'main'
        ? [main]
        : selector === '[data-mockup-id]'
          ? cards
          : layers[selector]
            ? [layers[selector]]
            : []) as never,
    elementFromPoint: () => underPointer,
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
    expect(inView.style.getPropertyValue('view-transition-class')).toBe('card')
    expect(below.style.getPropertyValue('view-transition-name')).toBe('')
    undo()
    expect(inView.style.getPropertyValue('view-transition-name')).toBe('')
    expect(inView.style.getPropertyValue('view-transition-class')).toBe('')
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

  it('names the panel’s layers only while the transition runs', async () => {
    const bg = document.createElement('div')
    const content = document.createElement('div')
    const { doc, finish } = fakeDoc([], true, {
      '[data-slot="main-panel-bg"]': bg,
      '[data-slot="main-content"]': content
    })
    panelTransition(vi.fn(), 'open', { doc })
    expect(bg.style.getPropertyValue('view-transition-name')).toBe('main-panel-bg')
    expect(content.style.getPropertyValue('view-transition-name')).toBe('main-content')
    finish()
    await Promise.resolve()
    await Promise.resolve()
    expect(bg.style.getPropertyValue('view-transition-name')).toBe('')
    expect(content.style.getPropertyValue('view-transition-name')).toBe('')
  })
})

describe('clicks while the panel morphs', () => {
  // Chromium sends every press during a view transition to <html>.
  const press = (doc: TransitionDocument, detail: number, at = { clientX: 50, clientY: 60 }) => {
    const html = doc.documentElement
    for (const type of ['mousedown', 'mouseup', 'click', ...(detail === 2 ? ['dblclick'] : [])]) {
      html.dispatchEvent(new MouseEvent(type, { bubbles: true, detail, ...at, metaKey: true }))
    }
  }
  const nextTask = () => new Promise((resolve) => setTimeout(resolve))

  it('ends the morph on a press and gives its click to what is under the pointer', () => {
    const button = document.createElement('button')
    const clicked = vi.fn()
    button.addEventListener('click', clicked)
    const { doc, skip } = fakeDoc([], true, {}, button)
    panelTransition(vi.fn(), 'open', { doc })
    press(doc, 1)
    expect(skip).toHaveBeenCalledOnce()
    expect(clicked).toHaveBeenCalledOnce()
    expect(clicked.mock.calls[0]![0]).toMatchObject({ clientX: 50, clientY: 60, metaKey: true })
  })

  it('gives the second click of a double-click to the card that sat there when the morph began', () => {
    const pile = card('6', { top: 0, bottom: 100, left: 0, right: 100 })
    const elsewhere = document.createElement('div')
    const got = { pile: [] as string[], elsewhere: [] as string[] }
    for (const type of ['click', 'dblclick']) {
      pile.addEventListener(type, () => got.pile.push(type))
      elsewhere.addEventListener(type, () => got.elsewhere.push(type))
    }
    const { doc } = fakeDoc([pile], true, {}, elsewhere)
    panelTransition(vi.fn(), 'open', { doc })
    press(doc, 2)
    expect(got.pile).toEqual(['click', 'dblclick'])
    expect(got.elsewhere).toEqual([])
  })

  it('waits for the new layout when a click lands before the morph has applied it', async () => {
    // The browser runs the update a frame after the transition starts; a click can come first.
    const before = document.createElement('div')
    const after = document.createElement('div')
    const got = { before: 0, after: 0 }
    before.addEventListener('click', () => got.before++)
    after.addEventListener('click', () => got.after++)
    let update: () => void = () => {}
    let finish: () => void = () => {}
    let applied = false
    const doc = {
      documentElement: document.createElement('html'),
      querySelectorAll: () => [] as never,
      elementFromPoint: () => (applied ? after : before),
      startViewTransition: (run: () => void) => {
        update = () => {
          run()
          applied = true
        }
        return {
          finished: new Promise<void>((resolve) => (finish = resolve)),
          skipTransition: vi.fn()
        }
      }
    } as unknown as TransitionDocument
    panelTransition(vi.fn(), 'open', { doc })
    press(doc, 1)
    expect(got).toEqual({ before: 0, after: 0 })
    update()
    finish()
    await nextTask()
    expect(got).toEqual({ before: 0, after: 1 })
  })

  it('finishes a press that began during the morph, then lets go of the page', async () => {
    const button = document.createElement('button')
    const clicked = vi.fn()
    button.addEventListener('click', clicked)
    const { doc, finish } = fakeDoc([], true, {}, button)
    panelTransition(vi.fn(), 'open', { doc })
    const html = doc.documentElement
    html.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, detail: 1 }))
    finish()
    await Promise.resolve()
    await Promise.resolve()
    html.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, detail: 1 }))
    html.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    expect(clicked).toHaveBeenCalledOnce()

    await nextTask()
    press(doc, 1)
    expect(clicked).toHaveBeenCalledOnce()
  })

  it('leaves clicks alone when nothing is morphing', async () => {
    const button = document.createElement('button')
    const clicked = vi.fn()
    button.addEventListener('click', clicked)
    const { doc, finish } = fakeDoc([], true, {}, button)
    panelTransition(vi.fn(), 'open', { doc })
    finish()
    await Promise.resolve()
    await Promise.resolve()
    press(doc, 1)
    expect(clicked).not.toHaveBeenCalled()
  })
})
