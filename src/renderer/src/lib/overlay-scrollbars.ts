/**
 * The one scrollbar for the whole app (roadmap B3, Figma D3). Native bars are hidden by a global
 * style in main.css; this draws a bar over any scroll area instead. Scrolling itself stays native
 * (wheel, trackpad, keyboard); the bar only draws and lets you drag the thumb or click the gutter.
 *
 *  - Pointer away, not scrolling: nothing on screen.
 *  - Scrolling without the pointer over the area: the thin thumb only, gone 800ms after the last scroll.
 *  - Pointer over the area: the gutter slides in from the edge with the thumb in it. The thumb grows
 *    under the pointer and fills more while dragging.
 *
 * The bars sit in one fixed layer above the content, so they never reflow anything.
 */

type Axis = 'vertical' | 'horizontal'

const FADE_DELAY_MS = 800
/** Shortest the thumb gets, so a very long list still has something to grab. */
const MIN_THUMB = 32
/** Gutter width in px (Figma S2). Must match `--ds-scrollbar-size` in main.css. */
const GUTTER = 12

interface Bar {
  axis: Axis
  lane: HTMLElement
  track: HTMLElement
  thumb: HTMLElement
}

interface Tracked {
  el: HTMLElement
  bars: Record<Axis, Bar>
  pointerIn: boolean
  scrolling: boolean
  dragging: Axis | null
  thumbHover: Axis | null
  timer: ReturnType<typeof setTimeout> | undefined
  observer: ResizeObserver | undefined
}

const SCROLLING = new Set(['auto', 'scroll'])

function overflows(el: HTMLElement, axis: Axis): boolean {
  const style = getComputedStyle(el)
  return axis === 'vertical'
    ? SCROLLING.has(style.overflowY) && el.scrollHeight > el.clientHeight + 1
    : SCROLLING.has(style.overflowX) && el.scrollWidth > el.clientWidth + 1
}

const scrollable = (el: HTMLElement): boolean =>
  overflows(el, 'vertical') || overflows(el, 'horizontal')

/** The nearest scroll area at or above `node`. */
function scrollerOf(node: EventTarget | null): HTMLElement | null {
  let el = node instanceof Element ? (node as HTMLElement) : null
  while (el && el !== document.documentElement) {
    if (scrollable(el)) return el
    el = el.parentElement
  }
  return null
}

function makeBar(axis: Axis, layer: HTMLElement, id: string): Bar {
  const lane = document.createElement('div')
  lane.className = 'ds-scrollbar'
  lane.dataset.axis = axis
  lane.dataset.scrollbarFor = id
  lane.dataset.state = 'hidden'
  const track = document.createElement('div')
  track.className = 'ds-scrollbar-track'
  const thumb = document.createElement('div')
  thumb.className = 'ds-scrollbar-thumb'
  lane.append(track, thumb)
  layer.append(lane)
  return { axis, lane, track, thumb }
}

export function installOverlayScrollbars(): () => void {
  const layer = document.createElement('div')
  layer.className = 'ds-scrollbar-layer'
  layer.setAttribute('aria-hidden', 'true')
  document.body.append(layer)

  const tracked = new Map<HTMLElement, Tracked>()
  const byId = new Map<string, Tracked>()
  let nextId = 0

  const track = (el: HTMLElement): Tracked => {
    let t = tracked.get(el)
    if (t) return t
    const id = String(nextId++)
    t = {
      el,
      bars: {
        vertical: makeBar('vertical', layer, id),
        horizontal: makeBar('horizontal', layer, id)
      },
      pointerIn: false,
      scrolling: false,
      dragging: null,
      thumbHover: null,
      timer: undefined,
      observer: undefined
    }
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => draw(el))
      observer.observe(el)
      t.observer = observer
    }
    tracked.set(el, t)
    byId.set(id, t)
    return t
  }

  const untrack = (t: Tracked) => {
    clearTimeout(t.timer)
    t.observer?.disconnect()
    t.bars.vertical.lane.remove()
    t.bars.horizontal.lane.remove()
    tracked.delete(t.el)
    for (const [id, other] of byId) if (other === t) byId.delete(id)
  }

  /** Puts the lanes over the area and sizes the thumbs; shows or hides them by state. */
  function draw(el: HTMLElement): void {
    const t = tracked.get(el)
    if (!t) return
    if (!el.isConnected) return untrack(t)
    const rect = el.getBoundingClientRect()
    const both = overflows(el, 'vertical') && overflows(el, 'horizontal')
    const radius = getComputedStyle(el)

    for (const bar of Object.values(t.bars)) {
      const vertical = bar.axis === 'vertical'
      const has = overflows(el, bar.axis)
      const open = has && (t.pointerIn || t.dragging === bar.axis)
      const showThumb = has && (open || t.scrolling)
      bar.lane.dataset.state = open ? 'open' : showThumb ? 'thumb' : 'hidden'
      bar.thumb.dataset.state =
        t.dragging === bar.axis ? 'dragging' : t.thumbHover === bar.axis ? 'hover' : 'idle'
      if (!has) continue

      const viewport = vertical ? el.clientHeight : el.clientWidth
      const content = vertical ? el.scrollHeight : el.scrollWidth
      const offset = vertical ? el.scrollTop : el.scrollLeft
      const trackLength = viewport - (both ? GUTTER : 0)
      const thumbLength = Math.min(
        trackLength,
        Math.max(MIN_THUMB, (trackLength * viewport) / content)
      )
      const range = content - viewport
      const thumbOffset = range > 0 ? (offset / range) * (trackLength - thumbLength) : 0

      const left = rect.left + el.clientLeft
      const top = rect.top + el.clientTop
      const { style } = bar.lane
      if (vertical) {
        style.left = `${left + el.clientWidth - GUTTER}px`
        style.top = `${top}px`
        style.height = `${trackLength}px`
        bar.thumb.style.height = `${thumbLength}px`
        bar.thumb.style.transform = `translate(-50%, ${thumbOffset}px)`
        bar.track.style.borderTopRightRadius = radius.borderTopRightRadius
        bar.track.style.borderBottomRightRadius = both ? '0' : radius.borderBottomRightRadius
      } else {
        style.left = `${left}px`
        style.top = `${top + el.clientHeight - GUTTER}px`
        style.width = `${trackLength}px`
        bar.thumb.style.width = `${thumbLength}px`
        bar.thumb.style.transform = `translate(${thumbOffset}px, -50%)`
        bar.track.style.borderBottomLeftRadius = radius.borderBottomLeftRadius
        bar.track.style.borderBottomRightRadius = both ? '0' : radius.borderBottomRightRadius
      }
    }
  }

  /** The scroll area the pointer is over, or none. Only that one shows its gutter. */
  const setPointer = (over: Tracked | null) => {
    for (const t of tracked.values()) {
      const inside = t === over
      if (t.pointerIn === inside) continue
      t.pointerIn = inside
      draw(t.el)
    }
  }

  const onScroll = (event: Event) => {
    const el = event.target
    if (!(el instanceof HTMLElement) || !scrollable(el)) return
    const t = track(el)
    t.scrolling = true
    clearTimeout(t.timer)
    t.timer = setTimeout(() => {
      t.scrolling = false
      draw(el)
    }, FADE_DELAY_MS)
    draw(el)
  }

  const onPointerOver = (event: PointerEvent) => {
    const target = event.target
    const lane =
      target instanceof Element ? target.closest<HTMLElement>('[data-scrollbar-for]') : null
    if (lane) {
      const t = byId.get(lane.dataset.scrollbarFor ?? '')
      if (t) {
        const axis = lane.dataset.axis as Axis
        const onThumb = target instanceof Element && target.closest('.ds-scrollbar-thumb') !== null
        t.thumbHover = onThumb ? axis : null
        setPointer(t)
        draw(t.el)
      }
      return
    }
    for (const t of tracked.values()) t.thumbHover = null
    const el = scrollerOf(target)
    const t = el ? track(el) : null
    setPointer(t)
    if (t) draw(t.el)
  }

  const onPointerOut = (event: PointerEvent) => {
    if (event.relatedTarget === null) {
      for (const t of tracked.values()) t.thumbHover = null
      setPointer(null)
    }
  }

  /** Drag the thumb, or click the gutter to page toward the click. */
  const onPointerDown = (event: PointerEvent) => {
    const target = event.target
    if (event.button !== 0 || !(target instanceof Element)) return
    const lane = target.closest<HTMLElement>('[data-scrollbar-for]')
    const t = lane ? byId.get(lane.dataset.scrollbarFor ?? '') : undefined
    if (!lane || !t) return
    const axis = lane.dataset.axis as Axis
    const vertical = axis === 'vertical'
    const bar = t.bars[axis]
    event.preventDefault()

    if (!target.closest('.ds-scrollbar-thumb')) {
      const thumbRect = bar.thumb.getBoundingClientRect()
      const before = vertical ? event.clientY < thumbRect.top : event.clientX < thumbRect.left
      const page = vertical ? t.el.clientHeight : t.el.clientWidth
      t.el.scrollBy({ [vertical ? 'top' : 'left']: before ? -page : page })
      return
    }

    const start = vertical ? event.clientY : event.clientX
    const startOffset = vertical ? t.el.scrollTop : t.el.scrollLeft
    const trackLength = vertical ? lane.offsetHeight : lane.offsetWidth
    const thumbLength = vertical ? bar.thumb.offsetHeight : bar.thumb.offsetWidth
    const range = vertical
      ? t.el.scrollHeight - t.el.clientHeight
      : t.el.scrollWidth - t.el.clientWidth
    const travel = Math.max(1, trackLength - thumbLength)
    t.dragging = axis
    draw(t.el)

    const move = (e: PointerEvent) => {
      const delta = ((vertical ? e.clientY : e.clientX) - start) * (range / travel)
      if (vertical) t.el.scrollTop = startOffset + delta
      else t.el.scrollLeft = startOffset + delta
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      t.dragging = null
      draw(t.el)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  const onResize = () => {
    for (const el of tracked.keys()) draw(el)
  }

  document.addEventListener('scroll', onScroll, true)
  document.addEventListener('pointerover', onPointerOver)
  document.addEventListener('pointerout', onPointerOut)
  document.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('resize', onResize)

  return () => {
    document.removeEventListener('scroll', onScroll, true)
    document.removeEventListener('pointerover', onPointerOver)
    document.removeEventListener('pointerout', onPointerOut)
    document.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('resize', onResize)
    for (const t of [...tracked.values()]) untrack(t)
    layer.remove()
  }
}
