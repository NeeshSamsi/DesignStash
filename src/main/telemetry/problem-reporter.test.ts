import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProblemReporter, REPORT_LIMITS } from './problem-reporter'

let dir: string
let queueFile: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ds-reporter-'))
  queueFile = join(dir, 'pending.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const make = (fetchImpl: typeof fetch, apiKey: string | null = 'phc_test') =>
  new ProblemReporter({
    apiKey: apiKey ?? undefined,
    host: 'https://us.i.posthog.com/',
    installId: 'install-1',
    queueFile,
    fetch: fetchImpl,
    now: () => new Date('2026-10-22T10:00:00Z')
  })
const ok = () => Promise.resolve(new Response('{}', { status: 200 }))

describe('ProblemReporter.send', () => {
  it('posts an anonymous problem_reported event with the message and details', async () => {
    const fetchMock = vi.fn(ok)
    const outcome = await make(fetchMock as unknown as typeof fetch).send('It froze', 'Version: 1')
    expect(outcome).toBe('sent')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }]
    expect(url).toBe('https://us.i.posthog.com/capture/')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({
      api_key: 'phc_test',
      event: 'problem_reported',
      distinct_id: 'install-1',
      properties: { message: 'It froze', details: 'Version: 1', $process_person_profile: false }
    })
  })

  it('scrubs paths and applies the size limits', async () => {
    const fetchMock = vi.fn(ok)
    await make(fetchMock as unknown as typeof fetch).send(
      `/Users/someone/Pictures/a.psd ${'x'.repeat(REPORT_LIMITS.message * 2)}`,
      'y'.repeat(REPORT_LIMITS.details * 2)
    )
    const props = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body).properties
    expect(props.message).toMatch(/^<path> x/)
    expect(props.message).toHaveLength(REPORT_LIMITS.message)
    expect(props.details).toHaveLength(REPORT_LIMITS.details)
  })

  it('is unavailable without a key and never touches the network', async () => {
    const fetchMock = vi.fn(ok)
    expect(await make(fetchMock as unknown as typeof fetch, null).send('hi', 'd')).toBe('unavailable')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps the report for the next launch when the network fails', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('offline')))
    expect(await make(failing as unknown as typeof fetch).send('hi', 'd')).toBe('queued')
    expect(JSON.parse(readFileSync(queueFile, 'utf-8'))).toHaveLength(1)
  })

  it('does not keep a report PostHog refused', async () => {
    const refusing = vi.fn(() => Promise.resolve(new Response('no', { status: 401 })))
    expect(await make(refusing as unknown as typeof fetch).send('hi', 'd')).toBe('unavailable')
    expect(existsSync(queueFile)).toBe(false)
  })
})

describe('ProblemReporter.flushQueued', () => {
  it('sends what was kept and empties the queue', async () => {
    await make((() => Promise.reject(new Error('offline'))) as unknown as typeof fetch).send('one', 'd')
    const fetchMock = vi.fn(ok)
    expect(await make(fetchMock as unknown as typeof fetch).flushQueued()).toBe(1)
    expect(JSON.parse(readFileSync(queueFile, 'utf-8'))).toEqual([])
  })

  it('stops at the first network failure and keeps the rest', async () => {
    const offline = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    await make(offline).send('one', 'd')
    await make(offline).send('two', 'd')
    expect(await make(offline).flushQueued()).toBe(0)
    expect(JSON.parse(readFileSync(queueFile, 'utf-8'))).toHaveLength(2)
  })
})
