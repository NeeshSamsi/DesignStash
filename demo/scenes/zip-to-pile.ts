/**
 * Scene: a zip is dropped on the window, the copy runs, the haul lands in To sort, Sort proposes the
 * zip as one pile, and the pile opens. Drives the packaged app the way e2e/journey.spec.ts does,
 * records only the app's window with demo/capture, and logs every cursor sample, drag event and
 * click (in window CSS pixels, with the capture's own clock) for the composition to draw.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { launchApp, PACKAGED_APP_ENV } from '../../e2e/fixtures/app'
import { testSet } from '../../e2e/fixtures/test-set'

const repo = resolve(__dirname, '../..')

/** Three PSDs in one real zip (from the held-out set), which Sort proposes as one pile. */
export const DROPPED_ZIP = 'held-out/minimal-imac-mockup.zip'

export interface SceneEvents {
  /** Window size in CSS pixels, and the capture's size in pixels. */
  window: { width: number; height: number }
  capture: { width: number; height: number }
  /** Cursor samples, `t` in seconds since the capture's first frame. */
  cursor: { t: number; x: number; y: number }[]
  /** The file being dragged in from outside the window. */
  drag: {
    tEnter: number
    tDrop: number
    x: number
    y: number
    from: { x: number; y: number }
  } | null
  clicks: { t: number; x: number; y: number; label: string }[]
  /** Named moments, for captions and labels. */
  marks: { t: number; name: string }[]
  duration: number
}

export interface SceneOptions {
  outDir: string
  /** Where the capture binary is. */
  captureBin: string
  /** The packaged DesignStash.app, else the built `out/` is run. */
  appPath?: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ease = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2)

interface Recording {
  proc: ChildProcess
  /** Epoch ms of the first frame. */
  zero: Promise<number>
  size: Promise<{ width: number; height: number }>
  stop: () => Promise<number>
}

function startCapture(bin: string, pid: number, out: string): Recording {
  const proc = spawn(bin, ['--pid', String(pid), '--out', out, '--fps', '60'], {
    stdio: ['ignore', 'pipe', 'inherit']
  })
  let resolveZero: (n: number) => void
  let resolveSize: (s: { width: number; height: number }) => void
  let resolveDone: (frames: number) => void
  const zero = new Promise<number>((r) => (resolveZero = r))
  const size = new Promise<{ width: number; height: number }>((r) => (resolveSize = r))
  const done = new Promise<number>((r) => (resolveDone = r))
  let buffer = ''
  proc.stdout!.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    for (const line of buffer.split('\n').slice(0, -1)) {
      const [kind, a, b] = line.split(' ')
      if (kind === 'READY') resolveZero(Number(a))
      if (kind === 'SIZE') resolveSize({ width: Number(a), height: Number(b) })
      if (kind === 'DONE') resolveDone(Number(a))
    }
    buffer = buffer.slice(buffer.lastIndexOf('\n') + 1)
  })
  proc.on('exit', () => resolveDone(0))
  return {
    proc,
    zero,
    size,
    stop: async () => {
      proc.kill('SIGINT')
      return done
    }
  }
}

export async function runScene(opts: SceneOptions) {
  mkdirSync(opts.outDir, { recursive: true })
  const footage = join(opts.outDir, 'footage.mov')
  const appPath = opts.appPath ?? process.env[PACKAGED_APP_ENV]
  if (appPath) process.env[PACKAGED_APP_ENV] = appPath

  const launched = await launchApp({ onboarded: true })
  const { window } = launched
  let recording: Recording | null = null
  try {
    const pid = launched.app.process().pid!
    // The window has to be on screen and frontmost for a clean take.
    await launched.app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win?.show()
      win?.focus()
    })
    await sleep(800)
    recording = startCapture(opts.captureBin, pid, footage)
    const zero = await recording.zero
    const capture = await recording.size
    const now = () => (Date.now() - zero) / 1000
    const size = await window.evaluate(() => ({ width: innerWidth, height: innerHeight }))

    const events: SceneEvents = {
      window: size,
      capture,
      cursor: [],
      drag: null,
      clicks: [],
      marks: [],
      duration: 0
    }
    const mark = (name: string) => {
      events.marks.push({ t: now(), name })
      if (process.env.DEMO_DEBUG) console.log(`mark ${name} ${now().toFixed(2)}s`)
    }
    let pos: { x: number; y: number } | null = null

    /** Moves the real mouse (so hover styles show) along an eased path and logs every sample. */
    const glide = async (to: { x: number; y: number }, ms: number) => {
      const from = pos ?? { x: to.x + 140, y: to.y + 90 }
      if (!pos) events.cursor.push({ t: now(), ...from })
      const start = Date.now()
      for (;;) {
        const p = Math.min(1, (Date.now() - start) / ms)
        const e = ease(p)
        const x = from.x + (to.x - from.x) * e
        const y = from.y + (to.y - from.y) * e
        await window.mouse.move(x, y)
        events.cursor.push({ t: now(), x, y })
        pos = { x, y }
        if (p >= 1) break
        await sleep(8)
      }
    }
    const centreOf = async (locator: ReturnType<Page['locator']>) => {
      const box = (await locator.boundingBox())!
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }
    const clickOn = async (locator: ReturnType<Page['locator']>, label: string, ms = 900) => {
      await locator.waitFor({ state: 'visible' })
      const at = await centreOf(locator)
      await glide(at, ms)
      await sleep(120)
      events.clicks.push({ t: now(), ...at, label })
      await window.mouse.down()
      await sleep(70)
      await window.mouse.up()
    }

    // 1. A quiet moment on the empty window, then the zip is dragged in from outside and dropped.
    await sleep(1400)
    mark('drag-start')
    const centre = { x: Math.round(size.width / 2), y: Math.round(size.height / 2) }
    const cdp = await window.context().newCDPSession(window)
    const drag = (type: 'dragEnter' | 'dragOver' | 'drop') =>
      cdp.send('Input.dispatchDragEvent', {
        type,
        ...centre,
        data: { items: [], files: [testSet.real(DROPPED_ZIP)], dragOperationsMask: 1 }
      })
    await sleep(1100) // the icon travels in (drawn by the composition)
    const tEnter = now()
    await drag('dragEnter')
    await drag('dragOver')
    await sleep(1000) // the drop overlay is up
    const tDrop = now()
    await drag('drop')
    await cdp.detach()
    events.drag = {
      tEnter,
      tDrop,
      ...centre,
      from: { x: size.width + 80, y: size.height * 0.78 }
    }
    pos = { ...centre }
    events.cursor.push({ t: now(), ...centre })
    mark('dropped')

    // 2. The copy runs and the haul lands in To sort.
    const toSort = window.getByRole('button', { name: /^To sort/ })
    await toSort.waitFor({ state: 'visible', timeout: 90_000 })
    mark('landed')
    await sleep(700)
    await clickOn(toSort, 'To sort')
    await window.getByText(/mockups? waiting to be sorted/).waitFor({ timeout: 60_000 })
    mark('to-sort')
    await window.getByText(/AI suggestions ready for all/).waitFor({ timeout: 30_000 })
    mark('suggestions-ready')
    await sleep(1500)

    // 3. Sort proposes the zip as one pile.
    await clickOn(window.getByRole('button', { name: 'Sort', exact: true }), 'Sort')
    await window.getByText('Sort into piles').first().waitFor()
    mark('sorted')
    await sleep(2200)

    // 4. The pile opens.
    await clickOn(window.getByRole('button', { name: 'Look them over' }), 'Look them over')
    await window.getByText('Pile 1 of 1', { exact: true }).waitFor()
    mark('pile-open')
    await sleep(2400)

    events.duration = now()
    const frames = await recording.stop()
    recording = null
    writeFileSync(join(opts.outDir, 'events.json'), JSON.stringify(events))
    return { footage, events, frames }
  } catch (error) {
    if (process.env.DEMO_DEBUG)
      await window.screenshot({ path: join(opts.outDir, 'failure.png') }).catch(() => undefined)
    throw error
  } finally {
    if (recording) await recording.stop().catch(() => undefined)
    await launched.close()
  }
}

if (require.main === module) {
  const out = join(repo, 'tmp', 'demo-scene')
  const bin = process.env.DEMO_CAPTURE_BIN ?? join(repo, 'tmp', 'demo-research', 'capture')
  runScene({ outDir: out, captureBin: bin, appPath: join(repo, 'dist/mac-arm64/DesignStash.app') })
    .then((r) => console.log('scene done', r.footage, r.frames, 'frames', r.events.duration, 's'))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
