import { flushSync } from 'react-dom'

/** Which way the details sidebar is going. The stylesheet times each direction on its own. */
export type PanelDirection = 'open' | 'close'

/** The slice of `Document` this needs, so a test can stand in for it. */
export interface TransitionDocument {
  documentElement: HTMLElement
  querySelectorAll: Document['querySelectorAll']
  elementFromPoint: (x: number, y: number) => Element | null
  startViewTransition?: (update: () => void) => {
    finished: Promise<unknown>
    skipTransition: () => void
  }
}

export interface PanelTransitionOptions {
  doc?: TransitionDocument
  /** `prefers-reduced-motion`: change at once, no animation. */
  reduced?: boolean
}

/** The one transition that can be running; a new toggle skips it. */
let running: { skipTransition: () => void } | null = null
/** The click forwarding of that transition (see keepClicks). */
let forwarding: { end: () => void; remove: () => void } | null = null

/** A card carries this prefix plus its mockup id as its transition name. */
export const CARD_TRANSITION_PREFIX = 'card-'

/** Every named card shares this class (`::view-transition-old(.card)` in the stylesheet). */
export const CARD_TRANSITION_CLASS = 'card'

/**
 * Names the cards that are on screen, so the browser morphs each from its old box to its new one.
 * Cards off screen are left out: they appear with the page, which keeps it cheap with many mockups.
 * Returns what to undo.
 */
export function nameVisibleCards(doc: TransitionDocument, view: DOMRect | null): () => void {
  return nameCards(visibleCards(doc, view))
}

interface PlacedCard {
  card: HTMLElement
  box: DOMRect
}

/** The cards on screen and where they sit; every card when there is no view to check against. */
function visibleCards(doc: TransitionDocument, view: DOMRect | null): PlacedCard[] {
  const placed: PlacedCard[] = []
  doc.querySelectorAll<HTMLElement>('[data-mockup-id]').forEach((card) => {
    const id = card.dataset.mockupId
    if (id === undefined || !/^[\w-]+$/.test(id)) return
    const box = card.getBoundingClientRect()
    if (view) {
      const visible =
        box.bottom > view.top &&
        box.top < view.bottom &&
        box.right > view.left &&
        box.left < view.right
      if (!visible) return
    }
    placed.push({ card, box })
  })
  return placed
}

function nameCards(placed: PlacedCard[]): () => void {
  for (const { card } of placed) {
    card.style.setProperty(
      'view-transition-name',
      `${CARD_TRANSITION_PREFIX}${card.dataset.mockupId}`
    )
    // The class lets the stylesheet treat every card alike: only its box morphs, one image, no double text.
    card.style.setProperty('view-transition-class', CARD_TRANSITION_CLASS)
  }
  return () =>
    placed.forEach(({ card }) => {
      card.style.removeProperty('view-transition-name')
      card.style.removeProperty('view-transition-class')
    })
}

const holds = (box: DOMRect, x: number, y: number) =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom

/**
 * Chromium sends every press made during a view transition to <html>, whatever `pointer-events` the
 * pseudo-elements have, so a click on a card while the panel morphs would be lost, and with it the
 * second click of a double-click on a pile. This hands those clicks on. A press ends the morph at once,
 * and its click goes to what is under the pointer then. The second click of a double-click goes to the
 * card that sat under the pointer when the morph began, where the first click landed, since the morph
 * has moved it since.
 *
 * It listens until the morph is over and a press made during it has let go (`end`), or until another
 * transition takes over (`remove`).
 */
function keepClicks(
  doc: TransitionDocument,
  before: PlacedCard[],
  skip: () => void
): { end: () => void; remove: () => void } {
  const root = doc.documentElement
  let pressing = false
  let ended = false

  const onDown = (event: MouseEvent) => {
    if (event.target !== root) return
    pressing = true
    skip()
  }
  const onUp = () => {
    if (!pressing) return
    // The click and the double-click follow mouseup in the same task.
    setTimeout(() => {
      pressing = false
      if (ended) remove()
    })
  }
  const onClick = (event: MouseEvent) => {
    if (event.target !== root) return
    const { clientX: x, clientY: y } = event
    const target =
      (event.detail >= 2 ? before.find(({ box }) => holds(box, x, y))?.card : undefined) ??
      doc.elementFromPoint(x, y)
    if (!target || target === root) return
    event.stopPropagation()
    target.dispatchEvent(new MouseEvent(event.type, event))
  }

  const remove = () => {
    root.removeEventListener('mousedown', onDown, true)
    root.removeEventListener('mouseup', onUp, true)
    root.removeEventListener('click', onClick, true)
    root.removeEventListener('dblclick', onClick, true)
  }
  root.addEventListener('mousedown', onDown, true)
  root.addEventListener('mouseup', onUp, true)
  root.addEventListener('click', onClick, true)
  root.addEventListener('dblclick', onClick, true)
  return {
    end: () => {
      ended = true
      if (!pressing) remove()
    },
    remove
  }
}

/**
 * Things that only slide sideways when the panel narrows: the same size in both layouts, so their
 * group is a pure translate and nothing scales. Everything else in the page stays in the root image
 * and just shows its new state, so no header or toolbar text is ever stretched.
 */
export const SIDE_MOVERS: ReadonlyArray<readonly [selector: string, name: string]> = [
  ['[data-ds="LibraryToolbar"] > :last-child', 'toolbar-end'],
  ['[data-slot="page-header-actions"]', 'header-actions']
]

/**
 * The panel's two layers: its empty surface and the content block above it. They are named only while
 * a transition runs, so at rest no element sits inside a named group.
 */
export const PANEL_LAYERS: ReadonlyArray<readonly [selector: string, name: string]> = [
  ['[data-slot="main-panel-bg"]', 'main-panel-bg'],
  ['[data-slot="main-content"]', 'main-content']
]

/** Names the panel's layers for the length of a transition. Returns what to undo. */
export function namePanelLayers(doc: TransitionDocument): () => void {
  const named: HTMLElement[] = []
  for (const [selector, name] of PANEL_LAYERS) {
    const el = doc.querySelectorAll<HTMLElement>(selector)[0]
    if (!el) continue
    el.style.setProperty('view-transition-name', name)
    named.push(el)
  }
  return () => named.forEach((el) => el.style.removeProperty('view-transition-name'))
}

/** Names the sideways movers for the length of a transition. Returns what to undo. */
export function nameSideMovers(doc: TransitionDocument): () => void {
  const named: HTMLElement[] = []
  for (const [selector, name] of SIDE_MOVERS) {
    const el = doc.querySelectorAll<HTMLElement>(selector)[0]
    if (!el) continue
    el.style.setProperty('view-transition-name', name)
    named.push(el)
  }
  return () => named.forEach((el) => el.style.removeProperty('view-transition-name'))
}

/**
 * Applies a layout change that opens or closes the details sidebar, morphing the page between the
 * two states with the View Transitions API: every visible card moves and resizes to its new place, the
 * main panel changes width, and the sidebar slides. `apply` changes React state; it runs inside the
 * transition so the browser sees the new layout at once.
 *
 * Without the API, or with reduced motion, `apply` just runs. A second toggle while one is running
 * skips the running one; `apply` still runs for both, so the layout always ends in the right state.
 * Chromium still sends every press during the morph to <html>; keepClicks hands each click on to what was pressed.
 */
export function panelTransition(
  apply: () => void,
  direction: PanelDirection,
  { doc = document, reduced = false }: PanelTransitionOptions = {}
): void {
  forwarding?.remove()
  forwarding = null
  if (reduced || typeof doc.startViewTransition !== 'function') {
    running?.skipTransition()
    running = null
    apply()
    return
  }
  running?.skipTransition()

  const root = doc.documentElement
  root.dataset.panelMotion = direction
  const main = doc.querySelectorAll<HTMLElement>('main')[0]
  const cards = visibleCards(doc, main?.getBoundingClientRect() ?? null)
  const forgetCards = nameCards(cards)
  const forgetMovers = nameSideMovers(doc)
  const forgetLayers = namePanelLayers(doc)
  const forget = () => {
    forgetCards()
    forgetMovers()
    forgetLayers()
  }

  const transition = doc.startViewTransition(() => flushSync(apply))
  running = transition
  const clicks = keepClicks(doc, cards, () => transition.skipTransition())
  forwarding = clicks
  const done = () => {
    if (running === transition) {
      running = null
      forget()
      delete root.dataset.panelMotion
    }
    clicks.end()
  }
  transition.finished.then(done, done)
}
