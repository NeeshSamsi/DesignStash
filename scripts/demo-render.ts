/**
 * pnpm demo:render zip-to-pile
 *
 * Drives the packaged app through a scene, records only its window, composes the clip with
 * HyperFrames and writes every format to demo/out/internal/<scene>/. See demo/README.md.
 *
 * Env: DESIGNSTASH_E2E_APP (a packaged DesignStash.app; default dist/mac-arm64/DesignStash.app),
 * DESIGNSTASH_TEST_SET (the test set, for the zip the scene drops).
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { clipLength, FORMATS, writeProject, type Format } from '../demo/compose/project'
import { runScene } from '../demo/scenes/zip-to-pile'

const repo = resolve(__dirname, '..')
/** Pinned: the same version renders the same video. Update on purpose, not by accident. */
const HYPERFRAMES = 'hyperframes@0.8.214'
const SCENES = ['zip-to-pile']

const scene = process.argv[2]
if (!scene || !SCENES.includes(scene)) {
  console.error(`usage: pnpm demo:render <${SCENES.join('|')}>`)
  process.exit(1)
}

const timings: [string, number][] = []
const t0 = Date.now()
async function step<T>(name: string, run: () => T | Promise<T>): Promise<T> {
  const start = Date.now()
  console.log(`\n== ${name}`)
  const result = await run()
  timings.push([name, (Date.now() - start) / 1000])
  return result
}

const work = join(repo, 'tmp/demo-work', scene)
const out = join(repo, 'demo/out/internal', scene)
const bin = join(repo, 'tmp/demo-work/.bin/capture')
const app = process.env.DESIGNSTASH_E2E_APP ?? join(repo, 'dist/mac-arm64/DesignStash.app')
if (!existsSync(app)) {
  console.error(`No packaged app at ${app}. Run pnpm package, or set DESIGNSTASH_E2E_APP.`)
  process.exit(1)
}

async function main(): Promise<void> {
  await step('build the capture command', () => {
    const source = join(repo, 'demo/capture/capture.swift')
    if (existsSync(bin) && statSync(bin).mtimeMs > statSync(source).mtimeMs) return
    mkdirSync(dirname(bin), { recursive: true })
    execFileSync('swiftc', ['-O', source, '-o', bin], { stdio: 'inherit' })
  })

  const { footage, events } = await step('drive the app and record its window', () => {
    rmSync(work, { recursive: true, force: true })
    return runScene({ outDir: join(work, 'take'), captureBin: bin, appPath: app })
  })

  const length = clipLength(events)
  const cfr = join(work, 'footage.mp4')
  await step('make the footage constant frame rate', () => {
    // The capture only writes frames when pixels change; the composition wants steady 60 fps.
    execFileSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-i',
        footage,
        '-t',
        String(length + 0.2),
        '-vf',
        'fps=60',
        '-an',
        '-c:v',
        'libx264',
        '-crf',
        '12',
        '-preset',
        'medium',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        cfr
      ],
      { stdio: 'inherit' }
    )
  })

  mkdirSync(out, { recursive: true })
  await step('turn HyperFrames telemetry off', () => {
    spawnSync('npx', ['--yes', HYPERFRAMES, 'telemetry', 'disable'], { stdio: 'ignore' })
  })

  const files: Record<Format, string> = {
    landscape: `${scene}-16x9.mp4`,
    portrait: `${scene}-9x16.mp4`,
    loop: `${scene}-loop.mp4`
  }
  for (const format of Object.keys(FORMATS) as Format[]) {
    await step(`render ${format}`, () => {
      const dir = join(work, format)
      writeProject(format, dir, events, cfr)
      execFileSync(
        'npx',
        [
          '--yes',
          HYPERFRAMES,
          'render',
          dir,
          '-o',
          join(out, files[format]),
          '--video-frame-format',
          'png',
          '--quality',
          'delivery'
        ],
        { stdio: ['ignore', 'ignore', 'inherit'] }
      )
    })
  }

  await step('poster frames', () => {
    const sorted = events.marks.find((m) => m.name === 'sorted')!.t + 1.5
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-ss',
      String(sorted),
      '-i',
      join(out, files.landscape),
      '-frames:v',
      '1',
      join(out, `${scene}-poster.png`)
    ])
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-ss',
      '3.1',
      '-i',
      join(out, files.loop),
      '-frames:v',
      '1',
      join(out, `${scene}-loop-poster.png`)
    ])
  })

  console.log('\nTimings')
  for (const [name, seconds] of timings)
    console.log(`  ${seconds.toFixed(1).padStart(6)} s  ${name}`)
  console.log(
    `  ${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s  total\n\nOutputs in ${out}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
