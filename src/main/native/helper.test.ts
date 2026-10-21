import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  HelperError,
  NativeHelper,
  defaultNativeHelperDeps,
  resolveHelperPath,
  type NativeHelperConfig,
  type NativeHelperDeps
} from './helper'

const FAKE = resolve('src/main/native/__fixtures__/fake-helper.mjs')

let dir: string
let logPath: string
const helpers: NativeHelper[] = []

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ds-helper-'))
  logPath = join(dir, 'log.txt')
  process.env.FAKE_HELPER_LOG = logPath
})

afterEach(async () => {
  await Promise.all(helpers.splice(0).map((h) => h.stop()))
  delete process.env.FAKE_HELPER_LOG
  rmSync(dir, { recursive: true, force: true })
})

function fake(
  config: Partial<NativeHelperConfig> = {},
  deps?: Partial<NativeHelperDeps>
): NativeHelper {
  const helper = new NativeHelper(
    { binaryPath: process.execPath, args: [FAKE], ...config },
    { ...defaultNativeHelperDeps, ...deps }
  )
  helpers.push(helper)
  return helper
}

const logLines = () => (existsSync(logPath) ? readFileSync(logPath, 'utf8').trim().split('\n') : [])
const starts = () => logLines().filter((l) => l === 'start').length
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function rejection(promise: Promise<unknown>): Promise<HelperError> {
  try {
    await promise
  } catch (err) {
    expect(err).toBeInstanceOf(HelperError)
    return err as HelperError
  }
  throw new Error('expected the call to fail')
}

describe('resolveHelperPath', () => {
  const home = '/Users/me'
  const dev = '/Users/me/Library/Application Support/DesignStash-dev/helper/designstash-helper'

  it('prefers DESIGNSTASH_HELPER, then the bundled copy, then the dev copy', () => {
    const all = () => true
    expect(resolveHelperPath({ DESIGNSTASH_HELPER: '/x/helper' }, '/res', home, all)).toBe(
      '/x/helper'
    )
    expect(resolveHelperPath({}, '/res', home, all)).toBe('/res/helper/designstash-helper')
    expect(resolveHelperPath({}, undefined, home, all)).toBe(dev)
  })

  it('skips paths that do not exist, and is null when none does', () => {
    expect(resolveHelperPath({ DESIGNSTASH_HELPER: '/gone' }, '/res', home, (p) => p === dev)).toBe(
      dev
    )
    expect(resolveHelperPath({}, '/res', home, () => false)).toBeNull()
  })
})

describe('NativeHelper', () => {
  it('answers each command with its typed result, from one process', async () => {
    const helper = fake()

    expect((await helper.info()).foundationModels).toEqual({ available: true })
    const ocr = await helper.ocr('/covers/a.webp', { level: 'fast' })
    expect(ocr.lines).toEqual([
      { text: 'text in /covers/a.webp', confidence: 0.9, box: [0.1, 0.2, 0.3, 0.4] }
    ])
    expect(ocr.level).toBe('fast')
    expect((await helper.people('/covers/a.webp')).peopleCount).toBe(1)
    expect((await helper.classify('/covers/a.webp')).labels[0]!.label).toBe('cup')
    const print = await helper.featurePrint('/covers/a.webp')
    expect(print.revision).toBe(2)
    expect(Array.from(print.vector)).toEqual([1, 2, 3])
    const reply = await helper.describe({
      imagePath: '/covers/a.webp',
      instructions: 'Be brief.',
      prompt: 'Describe it.',
      schema: { type: 'object' }
    })
    expect(reply.json).toBe(true)
    expect(JSON.parse(reply.text).title).toBe('Tape roll on a wall')

    expect(starts()).toBe(1)
    expect(helper.running).toBe(true)
  })

  it('sends the arguments in the protocol shape, leaving out what was not given', async () => {
    const helper = fake()
    await helper.ocr('/a.webp')
    await helper.classify('/a.webp', { max: 3 })
    await helper.describe({ imagePath: null, instructions: 'I', prompt: 'P' })
    const requests = logLines().filter((l) => l.startsWith('req '))
    expect(requests).toEqual([
      'req 1 ocr {"path":"/a.webp"}',
      'req 2 classify {"path":"/a.webp","max":3}',
      'req 3 describe {"path":null,"instructions":"I","prompt":"P"}'
    ])
  })

  it('queues calls and sends the next only after the last is answered', async () => {
    const helper = fake()
    const answers = await Promise.all([
      helper.ocr('/slow'),
      helper.ocr('/b'),
      helper.classify('/c')
    ])
    expect(answers[1].lines[0]!.text).toBe('text in /b')
    expect(
      logLines()
        .filter((l) => l !== 'start')
        .map((l) => l.split(' ').slice(0, 2).join(' '))
    ).toEqual(['req 1', 'res 1', 'req 2', 'res 2', 'req 3', 'res 3'])
  })

  it('turns an error reply into a HelperError, and keeps going', async () => {
    const helper = fake()
    const err = await rejection(helper.ocr('/missing'))
    expect(err.code).toBe('not_found')
    expect(err.message).toBe('no file at /missing')
    await expect(helper.ocr('/b')).resolves.toBeTruthy()
    expect(starts()).toBe(1)
  })

  it('refuses a result that is not the expected shape', async () => {
    const err = await rejection(fake().ocr('/badshape'))
    expect(err.code).toBe('bad_reply')
  })

  it('ignores lines on stdout that are not replies', async () => {
    await expect(fake().ocr('/garbage')).resolves.toMatchObject({ revision: 3 })
  })

  it('times out a hung call, stops that helper and starts a fresh one for the next', async () => {
    const helper = fake({ timeoutMs: 200 })
    const err = await rejection(helper.ocr('/hang'))
    expect(err.code).toBe('timeout')
    expect(err.message).toContain('ocr')
    await expect(helper.ocr('/b')).resolves.toBeTruthy()
    expect(starts()).toBe(2)
  })

  it('gives describe its own, longer timeout', async () => {
    const helper = fake({ timeoutMs: 50, describeTimeoutMs: 5_000 })
    await expect(
      helper.describe({ imagePath: '/slow', instructions: 'I', prompt: 'P' })
    ).resolves.toBeTruthy()
  })

  it('reports a crash with the end of its log, and starts again on the next call', async () => {
    const helper = fake()
    const err = await rejection(helper.ocr('/crash'))
    expect(err.code).toBe('crashed')
    expect(err.message).toContain('code 3')
    expect(err.message).toContain('about to crash')
    expect(helper.running).toBe(false)
    await expect(helper.ocr('/b')).resolves.toBeTruthy()
    expect(starts()).toBe(2)
  })

  it('fails calls behind a crashed one only if they were sent; queued calls go to the next helper', async () => {
    const helper = fake()
    const [crashed, next] = await Promise.allSettled([helper.ocr('/crash'), helper.ocr('/b')])
    expect(crashed.status).toBe('rejected')
    expect(next.status).toBe('fulfilled')
  })

  it('is unavailable, never a crash, when there is no binary', async () => {
    const none = new NativeHelper({ binaryPath: null })
    expect((await rejection(none.info())).code).toBe('unavailable')
    const gone = new NativeHelper({ binaryPath: join(dir, 'no-such-helper') })
    helpers.push(gone)
    const err = await rejection(gone.info())
    expect(err.code).toBe('unavailable')
    expect(err.message).toContain('no-such-helper')
    expect(gone.running).toBe(false)
  })

  it('stops after the idle time and starts again on the next call', async () => {
    const helper = fake({ idleMs: 100 })
    await helper.info()
    expect(helper.running).toBe(true)
    await sleep(400)
    expect(helper.running).toBe(false)
    await helper.info()
    expect(starts()).toBe(2)
  })

  it('stop() ends the process, and a later call starts a new one', async () => {
    const helper = fake()
    await helper.info()
    await helper.stop()
    expect(helper.running).toBe(false)
    await helper.info()
    expect(starts()).toBe(2)
  })

  it('kills the helper if the app quits, and forgets the hook once it has exited', async () => {
    const listeners = new Set<() => void>()
    const helper = fake(
      {},
      {
        onParentExit: (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        }
      }
    )
    await helper.info()
    expect(listeners.size).toBe(1)
    for (const listener of listeners) listener()
    await sleep(200)
    expect(helper.running).toBe(false)
    expect(listeners.size).toBe(0)
  })
})
