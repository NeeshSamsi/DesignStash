/* eslint-disable no-undef -- runs in the HyperFrames page, where window, document and gsap exist */
// Everything that moves in the composition is a pure function of the time `t`, so a seek to any
// frame draws the same picture. Reads window.__events (the scene's log) and window.__layout.
;(function () {
  const E = window.__events
  const L = window.__layout
  const $ = (id) => document.getElementById(id)
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const smooth = (p) => p * p * (3 - 2 * p)
  const mark = (name) => (E.marks.find((m) => m.name === name) || { t: 0 }).t
  const click = (label) => E.clicks.find((c) => c.label === label)

  const W = E.window.width
  const H = E.window.height
  const centre = { x: W / 2, y: H / 2 }

  // Where the camera looks, in window CSS pixels, as a list of times and anchor points.
  const sortClick = click('Sort')
  const toSortClick = click('To sort')
  const lookClick = click('Look them over')
  const anchors = [
    { t: 0, ...centre },
    { t: E.drag.tDrop + 0.4, ...centre },
    { t: toSortClick.t - 0.5, x: toSortClick.x + 200, y: toSortClick.y + 40 },
    { t: toSortClick.t, x: toSortClick.x + 120, y: toSortClick.y + 60 },
    { t: mark('to-sort') + 0.2, x: 680, y: 290 },
    { t: sortClick.t - 0.7, x: 880, y: 200 },
    { t: sortClick.t, x: sortClick.x - 120, y: sortClick.y + 120 },
    { t: mark('sorted') + 0.2, x: 420, y: 330 },
    { t: lookClick.t - 0.9, x: 520, y: 420 },
    { t: lookClick.t, x: lookClick.x - 200, y: lookClick.y - 180 },
    { t: mark('pile-open') + 0.3, x: 600, y: 440 },
    { t: E.duration + 5, ...centre }
  ]
  // Zoom keyframes: [time, zoom]. The landscape layout pushes in on the cards and the pile.
  const zooms = L.zoomKeys(E, { mark, sortClick, lookClick, toSortClick })

  function lerpKeys(keys, t, key) {
    if (t <= keys[0].t) return keys[0][key]
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i].t) {
        const p = smooth((t - keys[i - 1].t) / (keys[i].t - keys[i - 1].t || 1))
        return keys[i - 1][key] + (keys[i][key] - keys[i - 1][key]) * p
      }
    }
    return keys[keys.length - 1][key]
  }
  const zoomKeys = zooms.map(([t, z]) => ({ t, z }))
  const cursorAt = (t) => {
    const s = E.cursor
    if (!s.length || t < s[0].t) return null
    let lo = 0
    let hi = s.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (s[mid].t <= t) lo = mid
      else hi = mid - 1
    }
    const a = s[lo]
    const b = s[Math.min(lo + 1, s.length - 1)]
    const p = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0
    return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p }
  }

  // Camera centre follows the anchors, smoothed over 0.45 s (a fixed-step filter, so it is a function of t).
  const STEP = 1 / 120
  const track = []
  {
    let x = centre.x
    let y = centre.y
    for (let t = 0; t <= E.duration + 0.01; t += STEP) {
      const tx = lerpKeys(anchors, t, 'x')
      const ty = lerpKeys(anchors, t, 'y')
      const k = 1 - Math.exp(-STEP / 0.22)
      x += (tx - x) * k
      y += (ty - y) * k
      track.push({ x, y })
    }
  }
  const camAt = (t) => track[clamp(Math.round(t / STEP), 0, track.length - 1)]

  const stage = $('window-layer')
  const cursor = $('cursor')
  const ring = $('ring')
  const dragIcon = $('drag-icon')
  const captions = [...document.querySelectorAll('[data-cap]')]
  const pill = $('pill')
  const card = $('title-card')

  function apply(local) {
    const t = local + (L.offset || 0)
    // Camera
    const z = lerpKeys(zoomKeys, t, 'z')
    const s = L.baseScale * z
    const c = camAt(t)
    // Keep the whole window in view when not zoomed in, and the view inside the window when zoomed.
    const fit = clamp((z - 1) / (L.fullZoom - 1 || 1), 0, 1)
    const cx = centre.x + (c.x - centre.x) * (L.follow ? 1 : fit)
    const cy = centre.y + (c.y - centre.y) * (L.follow ? 1 : fit)
    let tx = L.viewW / 2 - cx * s
    let ty = L.viewH / 2 - cy * s
    // Do not slide past the window's edges.
    if (W * s > L.viewW) tx = clamp(tx, L.viewW - W * s, 0)
    else tx = (L.viewW - W * s) / 2
    if (H * s > L.viewH) ty = clamp(ty, L.viewH - H * s, 0)
    else ty = (L.viewH - H * s) / 2
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`

    // Cursor (window CSS pixels, so it lives inside the scaled layer)
    const cur = cursorAt(t)
    const showCursor = cur && t >= E.drag.tDrop
    cursor.style.opacity = showCursor ? clamp((t - E.drag.tDrop) / 0.25, 0, 1) : 0
    if (cur)
      cursor.style.transform = `translate(${cur.x}px, ${cur.y}px) scale(${(1 / s) * L.cursorScale})`

    // Click ring
    let ringOn = 0
    let rx = 0
    let ry = 0
    let rp = 0
    for (const k of E.clicks) {
      if (t >= k.t && t < k.t + 0.55) {
        ringOn = 1
        rx = k.x
        ry = k.y
        rp = (t - k.t) / 0.55
      }
    }
    ring.style.opacity = ringOn ? 1 - rp : 0
    ring.style.transform = `translate(${rx}px, ${ry}px) scale(${((0.4 + rp * 1.6) / s) * L.cursorScale})`

    // The dragged file: travels in from outside, hovers over the window while the overlay is up, drops in.
    const d = E.drag
    const t0 = d.tEnter - 1.15
    let iconOpacity = 0
    let ix = d.x
    let iy = d.y
    let iscale = 1
    if (t >= t0 && t < d.tDrop + 0.3) {
      const p = smooth(clamp((t - t0) / 1.15, 0, 1))
      ix = d.from.x + (d.x - d.from.x) * p
      iy = d.from.y + (d.y - d.from.y) * p + (t > d.tEnter ? Math.sin((t - d.tEnter) * 5) * 3 : 0)
      iconOpacity = clamp((t - t0) / 0.2, 0, 1)
      if (t > d.tDrop) {
        const q = clamp((t - d.tDrop) / 0.3, 0, 1)
        iscale = 1 - 0.55 * q
        iconOpacity = 1 - q
      }
    }
    dragIcon.style.opacity = iconOpacity
    dragIcon.style.transform = `translate(${ix}px, ${iy}px) scale(${(iscale / s) * L.cursorScale})`

    // Captions: the last one whose start time has passed
    let active = -1
    captions.forEach((el, i) => {
      if (t >= parseFloat(el.dataset.cap)) active = i
    })
    captions.forEach((el, i) => {
      const start = parseFloat(el.dataset.cap)
      const on = i === active && t >= start
      el.style.opacity = on ? clamp((t - start) / 0.3, 0, 1) : 0
      el.style.transform = `translateY(${on ? (1 - clamp((t - start) / 0.3, 0, 1)) * 10 : 10}px)`
    })

    // "AI wait skipped" pill while the To sort page shows suggestions that, on a real run, take ~10 s each.
    if (pill) {
      const a = mark('to-sort')
      const b = sortClick.t + 0.1
      pill.style.opacity =
        t >= a && t < b ? clamp((t - a) / 0.3, 0, 1) * clamp((b - t) / 0.3, 0, 1) : 0
    }

    // Title card over the first moments
    if (card)
      card.style.opacity =
        local < L.cardEnd ? 1 - smooth(clamp((local - (L.cardEnd - 0.5)) / 0.5, 0, 1)) : 0

    // Loop fade
    if (L.fade) {
      const f = $('fade')
      f.style.opacity = Math.max(
        1 - clamp(local / 0.25, 0, 1),
        clamp((local - (L.length - 0.35)) / 0.35, 0, 1)
      )
    }
  }

  const tl = gsap.timeline({ paused: true })
  const proxy = { t: 0 }
  tl.to(proxy, { t: L.length, duration: L.length, ease: 'none', onUpdate: () => apply(proxy.t) }, 0)
  tl.eventCallback('onUpdate', () => apply(tl.time()))
  apply(0)
  window.__timelines = window.__timelines || {}
  window.__timelines.main = tl
})()
