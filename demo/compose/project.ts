/**
 * Writes one HyperFrames project per output format: an index.html that lays the window footage out
 * on a 1920×1080, 1080×1920 or loop-sized canvas, plus the scene's event log and the shared stage.js.
 * Everything that moves is driven by stage.js from the log, so a re-render gives the same video.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { SceneEvents } from '../scenes/zip-to-pile'

const here = __dirname

export type Format = 'landscape' | 'portrait' | 'loop'

export interface FormatSpec {
  width: number
  height: number
  fps: number
}

export const FORMATS: Record<Format, FormatSpec> = {
  landscape: { width: 1920, height: 1080, fps: 60 },
  portrait: { width: 1080, height: 1920, fps: 60 },
  loop: { width: 1280, height: 800, fps: 30 }
}

/** The seconds of footage the clip keeps after the pile opens. */
const TAIL = 0.9

const CAPTIONS = (e: SceneEvents) => {
  const mark = (name: string) => e.marks.find((m) => m.name === name)!.t
  return [
    { t: 1.7, text: 'Drop a zip anywhere in the window' },
    { t: e.drag!.tDrop + 0.2, text: 'It copies in and waits in To sort' },
    { t: mark('to-sort') + 0.3, text: 'Each mockup gets a suggested name and tags' },
    {
      t: e.clicks.find((c) => c.label === 'Sort')!.t + 0.3,
      text: 'Sort proposes the zip as one pile'
    },
    { t: mark('pile-open') - 0.1, text: 'The pile opens, ready to look over' }
  ]
}

export function clipLength(e: SceneEvents): number {
  return e.marks.find((m) => m.name === 'pile-open')!.t + TAIL
}

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{overflow:hidden;background:#0b0807;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;color:#f4ece8}
#root{position:relative;overflow:hidden;background:radial-gradient(120% 90% at 50% 0%,#241917 0%,#0b0807 70%)}
#view{position:absolute;overflow:hidden;background:#150e0d}
#window-layer{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}
#footage{position:absolute;left:0;top:0;display:block}
#cursor,#ring,#drag-icon{position:absolute;left:0;top:0;transform-origin:0 0;opacity:0;pointer-events:none}
#ring{width:60px;height:60px;margin:-30px 0 0 -30px;border:3px solid #ffb089;border-radius:50%}
#drag-icon{margin:-30px 0 0 -24px}
.cap{position:absolute;left:0;right:0;text-align:center;opacity:0;font-weight:600;letter-spacing:-0.01em}
.badge{position:absolute;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#ffcfae;background:#3a1c10cc;border:1px solid #ff8a4d88;border-radius:999px}
#pill{position:absolute;opacity:0;color:#f4ece8;background:#241917ee;border:1px solid #ffffff33;border-radius:999px}
#title-card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0b0807;text-align:center;opacity:1}
#title-card h1{font-weight:700;letter-spacing:-0.03em}
#title-card p{margin-top:18px;color:#ffcfae;letter-spacing:0.1em;text-transform:uppercase;font-weight:600}
#fade{position:absolute;inset:0;background:#0b0807;opacity:0}
`

const CURSOR_SVG = `<svg width="28" height="28" viewBox="0 0 28 28"><path d="M3 2 L3 21 L8 16.5 L11.5 24 L14.6 22.7 L11.2 15.4 L18 15 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>`
const FILE_SVG = `<svg width="48" height="60" viewBox="0 0 48 60"><path d="M4 2 H30 L44 16 V56 a2 2 0 0 1 -2 2 H4 a2 2 0 0 1 -2 -2 V4 a2 2 0 0 1 2 -2 Z" fill="#f4ece8" stroke="#111" stroke-width="2"/><path d="M30 2 V16 H44" fill="#d9ccc6" stroke="#111" stroke-width="2"/><rect x="9" y="34" width="30" height="14" rx="3" fill="#c2410c"/><text x="24" y="45" font-size="10" font-weight="700" text-anchor="middle" fill="#fff" font-family="Helvetica,Arial">ZIP</text></svg>`

interface Layout {
  viewX: number
  viewY: number
  viewW: number
  viewH: number
  baseScale: number
  fullZoom: number
  follow: boolean
  cursorScale: number
  radius: number
  html: string
  zoomKeys: string
  cardEnd: number
  fade: boolean
  offset: number
}

function layoutFor(format: Format, e: SceneEvents): Layout {
  const W = e.window.width
  const H = e.window.height
  if (format === 'landscape') {
    const s = 1520 / W
    return {
      viewX: 200,
      viewY: 65,
      viewW: 1520,
      viewH: H * s,
      baseScale: s,
      fullZoom: 1.4,
      follow: false,
      cursorScale: 1.15,
      radius: 18,
      cardEnd: 1.6,
      fade: false,
      offset: 0,
      // Push in to 1.4x on the cards and on the pile, then back out for the clicks.
      zoomKeys: `(E, k) => [[0,1],[k.mark('to-sort')+0.2,1],[k.mark('to-sort')+1.1,1.4],[k.sortClick.t-0.9,1.4],[k.sortClick.t-0.1,1],[k.mark('sorted')+0.3,1],[k.mark('sorted')+1.2,1.4],[k.lookClick.t-1.3,1.4],[k.lookClick.t-0.4,1],[E.duration+5,1]]`,
      html: `
<div id="view" style="left:200px;top:65px;width:1520px;height:${Math.round(H * s)}px;border-radius:18px;box-shadow:0 30px 80px #000a">
  LAYER
</div>
<div class="badge" style="left:200px;top:18px;padding:6px 16px;font-size:20px">Internal test</div>
<div id="caps" style="position:absolute;left:0;right:0;top:${65 + Math.round(H * s) + 22}px;height:60px">${CAPTIONS(
        e
      )
        .map(
          (c) =>
            `<div class="cap" data-cap="${c.t.toFixed(2)}" style="font-size:36px">${c.text}</div>`
        )
        .join('')}</div>
<div id="pill" style="right:200px;top:14px;padding:8px 18px;font-size:20px">AI wait skipped: about 10 s per mockup on-device</div>
<div id="title-card"><h1 style="font-size:96px">DesignStash</h1><p style="font-size:28px">Internal test, not for publishing</p></div>`
    }
  }
  if (format === 'portrait') {
    const s = 1.5
    return {
      viewX: 0,
      viewY: 430,
      viewW: 1080,
      viewH: 1080,
      baseScale: s,
      fullZoom: 1,
      follow: true,
      cursorScale: 1.25,
      radius: 0,
      cardEnd: 1.6,
      fade: false,
      offset: 0,
      zoomKeys: `(E, k) => [[0,1],[k.mark('to-sort')+0.1,1],[k.mark('to-sort')+0.9,0.9],[k.sortClick.t,0.9],[k.mark('sorted')+0.3,1],[k.lookClick.t-0.3,1],[k.mark('pile-open')+0.2,0.78],[E.duration+5,0.78]]`,
      html: `
<div id="view" style="left:0;top:430px;width:1080px;height:1080px"> LAYER </div>
<div class="badge" style="left:48px;top:48px;padding:8px 20px;font-size:26px">Internal test</div>
<div style="position:absolute;left:48px;right:48px;top:150px;font-size:84px;font-weight:700;letter-spacing:-0.03em;line-height:1.02">Drop a zip.<br>Get a pile.</div>
<div id="caps" style="position:absolute;left:48px;right:48px;top:1560px;height:200px">${CAPTIONS(e)
        .map(
          (c) =>
            `<div class="cap" data-cap="${c.t.toFixed(2)}" style="font-size:54px;text-align:left;left:0;right:0;line-height:1.1">${c.text}</div>`
        )
        .join('')}</div>
<div id="pill" style="left:48px;top:1770px;padding:12px 24px;font-size:30px">AI wait skipped: about 10 s per mockup on-device</div>
<div id="title-card"><h1 style="font-size:130px">DesignStash</h1><p style="font-size:36px">Internal test,<br>not for publishing</p></div>`
    }
  }
  // loop: the drop and the copy, window only, 1280×800
  const s = 1280 / W
  return {
    viewX: 0,
    viewY: 0,
    viewW: 1280,
    viewH: 800,
    baseScale: s,
    fullZoom: 1,
    follow: false,
    cursorScale: 1.1,
    radius: 0,
    cardEnd: 0,
    fade: true,
    offset: e.drag!.tEnter - 1.3,
    zoomKeys: `(E) => [[0,1],[E.duration+5,1]]`,
    html: `
<div id="view" style="left:0;top:0;width:1280px;height:800px"> LAYER </div>
<div class="badge" style="right:14px;bottom:12px;padding:3px 12px;font-size:14px">Internal test</div>
<div id="fade"></div>`
  }
}

export function writeProject(
  format: Format,
  dir: string,
  events: SceneEvents,
  footage: string
): number {
  const spec = FORMATS[format]
  const l = layoutFor(format, events)
  const full = clipLength(events)
  const length = format === 'loop' ? 4 : full
  mkdirSync(dir, { recursive: true })
  copyFileSync(footage, join(dir, 'footage.mp4'))
  copyFileSync(join(here, 'stage.js'), join(dir, 'stage.js'))
  copyFileSync(join(here, 'template', 'hyperframes.json'), join(dir, 'hyperframes.json'))
  writeFileSync(
    join(dir, 'meta.json'),
    JSON.stringify({ id: `demo-${format}`, name: `demo-${format}` })
  )
  writeFileSync(
    join(dir, 'layout.js'),
    `window.__events = ${JSON.stringify(events)}\nwindow.__layout = ${JSON.stringify({
      viewW: l.viewW,
      viewH: l.viewH,
      baseScale: l.baseScale,
      fullZoom: l.fullZoom,
      follow: l.follow,
      cursorScale: l.cursorScale,
      cardEnd: l.cardEnd,
      fade: l.fade,
      length,
      offset: l.offset
    })}\nwindow.__layout.zoomKeys = ${l.zoomKeys}\n`
  )
  const W = events.window.width
  const H = events.window.height
  const layer = `<div id="window-layer" style="width:${W}px;height:${H}px;border-radius:${l.radius ? 14 : 0}px;overflow:visible">
    <video id="footage" class="clip" data-start="0" data-duration="${length}" data-media-start="${l.offset.toFixed(3)}" data-track-index="0" src="footage.mp4" muted playsinline style="width:${W}px;height:${H}px;border-radius:14px"></video>
    <div id="drag-icon">${FILE_SVG}${'<div style="position:absolute;left:30px;top:34px">' + CURSOR_SVG + '</div>'}</div>
    <div id="ring"></div>
    <div id="cursor">${CURSOR_SVG}</div>
  </div>`
  const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=${spec.width}, height=${spec.height}"/>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>${CSS}html,body,#root{width:${spec.width}px;height:${spec.height}px}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${length}" data-width="${spec.width}" data-height="${spec.height}" data-fps="${spec.fps}">
${l.html.replace('LAYER', layer)}
</div>
<script src="layout.js"></script>
<script src="stage.js"></script>
</body></html>`
  writeFileSync(join(dir, 'index.html'), html)
  return length
}

export const composeDir = resolve(here)
