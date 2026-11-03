import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HELPER_PROTOCOL } from './helper-schemas'
import { HelperError, NativeHelper, resolveHelperPath } from './helper'

/**
 * The real Swift helper, run by hand after `pnpm helper:build`:
 *   DESIGNSTASH_HELPER_IT=1 npx vitest run src/main/native/helper.integration.test.ts
 * Opt-in, because it runs Apple's Vision models; it never calls Foundation Models.
 */
const binaryPath = resolveHelperPath(process.env, undefined)
const enabled = process.env.DESIGNSTASH_HELPER_IT === '1' && binaryPath !== null

describe.runIf(enabled)('designstash-helper (real binary)', () => {
  let dir: string
  let helper: NativeHelper
  let printed: string

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ds-helper-it-'))
    printed = join(dir, 'printed.png')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="100%" height="100%" fill="white"/><text x="80" y="240" font-family="Helvetica" font-size="140" fill="black">SNACKBAR</text></svg>`
    await sharp(Buffer.from(svg)).png().toFile(printed)
    helper = new NativeHelper({ binaryPath })
  })

  afterAll(async () => {
    await helper.stop()
    rmSync(dir, { recursive: true, force: true })
  })

  it('speaks protocol 1 and reports Vision revisions', async () => {
    const info = await helper.info()
    expect(info.protocol).toBe(HELPER_PROTOCOL)
    expect(info.vision.ocr!.supported).toContain(info.vision.ocr!.current)
    expect(typeof info.foundationModels.available).toBe('boolean')
  })

  it('reads printed text with a top-left box', async () => {
    const ocr = await helper.ocr(printed)
    expect(ocr.lines.map((l) => l.text.toUpperCase())).toContain('SNACKBAR')
    const [x, y, w, h] = ocr.lines[0]!.box
    expect(x).toBeGreaterThan(0)
    expect(y).toBeGreaterThan(0.2)
    expect(y + h).toBeLessThan(0.9)
    expect(w).toBeGreaterThan(0.3)
  }, 90_000)

  it('gives a feature print, labels and no people on a plain image', async () => {
    const print = await helper.featurePrint(printed)
    expect(print.vector.length).toBe(print.elementCount)
    expect(print.elementCount).toBeGreaterThan(100)
    expect((await helper.classify(printed)).labels.length).toBeGreaterThan(0)
    expect((await helper.people(printed)).peopleCount).toBe(0)
  })

  it('answers bad requests with error replies and keeps running', async () => {
    const notImage = join(dir, 'notes.txt')
    writeFileSync(notImage, 'not an image')
    const code = (p: Promise<unknown>) =>
      p.then(
        () => 'ok',
        (err: HelperError) => err.code
      )
    expect(await code(helper.ocr(join(dir, 'nope.png')))).toBe('not_found')
    expect(await code(helper.ocr(notImage))).toBe('unreadable_image')
    expect(await code(helper.ocr(dir))).toBe('not_found')
    expect(await code(helper.ocr(printed, { level: 'slow' as 'fast' }))).toBe('bad_args')
    expect(helper.running).toBe(true)
  })
})
