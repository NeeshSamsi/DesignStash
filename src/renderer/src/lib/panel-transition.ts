import { flushSync } from 'react-dom'

/** Which way the details sidebar is going. The stylesheet times each direction on its own. */
export type PanelDirection = 'open' | 'close'

/** The slice of `Document` this needs, so a test can stand in for it. */
export interface TransitionDocument {
  documentElement: HTMLElement
  querySelectorAll: Document['querySelectorAll']
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
  const named: HTMLElement[] = []
  doc.querySelectorAll<HTMLElement>('[data-mockup-id]').forEach((card) => {
    const id = card.dataset.mockupId
    if (id === undefined || !/^[\w-]+$/.test(id)) return
    if (view) {
      const box = card.getBoundingClientRect()
      const visible =
        box.bottom > view.top &&
        box.top < view.bottom &&
        box.right > view.left &&
        box.left < view.right
      if (!visible) return
    }
    card.style.setProperty('view-transition-name', `${CARD_TRANSITION_PREFIX}${id}`)
    // The class lets the stylesheet treat every card alike: only its box morphs, one image, no double text.
    card.style.setProperty('view-transition-class', CARD_TRANSITION_CLASS)
    named.push(card)
  })
  return () =>
    named.forEach((card) => {
      card.style.removeProperty('view-transition-name')
      card.style.removeProperty('view-transition-class')
    })
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
 * Pointer events pass through the transition's overlay (see styles/details-transition.css).
 */
export function panelTransition(
  apply: () => void,
  direction: PanelDirection,
  { doc = document, reduced = false }: PanelTransitionOptions = {}
): void {
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
  const forgetCards = nameVisibleCards(doc, main?.getBoundingClientRect() ?? null)
  const forgetMovers = nameSideMovers(doc)
  const forget = () => {
    forgetCards()
    forgetMovers()
  }

  const transition = doc.startViewTransition(() => flushSync(apply))
  running = transition
  const done = () => {
    if (running === transition) {
      running = null
      forget()
      delete root.dataset.panelMotion
    }
  }
  transition.finished.then(done, done)
}
