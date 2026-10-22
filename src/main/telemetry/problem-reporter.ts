import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { TELEMETRY_EVENTS } from '../../shared/telemetry'
import { logger } from '../logger'
import { scrubText } from './scrub'

/** Size limits for what one report carries. The tester sees all of it before pressing Send. */
export const REPORT_LIMITS = {
  /** Characters of the tester's own words. */
  message: 4000,
  /** Characters of facts plus log tail. */
  details: 40000,
  /** Reports waiting for the next launch. */
  queued: 5
} as const

export type SendOutcome = 'sent' | 'queued' | 'unavailable'

interface QueuedReport {
  message: string
  details: string
  at: string
}

export interface ProblemReporterOptions {
  /** Null in dev, tests and builds made without a key: nothing can be sent, so Send answers 'unavailable'. */
  apiKey: string | undefined
  host: string
  installId: string
  /** Where unsent reports wait (userData/pending-reports.json). */
  queueFile: string
  fetch?: typeof fetch
  now?: () => Date
}

function readQueue(file: string): QueuedReport[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf-8'))
    return Array.isArray(parsed) ? (parsed as QueuedReport[]) : []
  } catch {
    return []
  }
}

function writeQueue(file: string, queue: QueuedReport[]): void {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(queue), 'utf-8')
  } catch (err) {
    logger.warn('Could not save a problem report for later', err)
  }
}

/**
 * Sends "Report a problem" to PostHog as a `problem_reported` event. It does not depend on the
 * analytics switch: the tester presses Send after seeing exactly what goes. It uses PostHog's
 * capture endpoint directly, so it can report whether the send worked. Everything goes through
 * the same path scrubbing, and the event is anonymous (no person profile, no GeoIP).
 */
export class ProblemReporter {
  private readonly doFetch: typeof fetch
  private readonly now: () => Date

  constructor(private readonly opts: ProblemReporterOptions) {
    this.doFetch = opts.fetch ?? ((...args) => fetch(...args))
    this.now = opts.now ?? (() => new Date())
  }

  get canSend(): boolean {
    return Boolean(this.opts.apiKey)
  }

  /** Send now. A network failure keeps the report for the next launch; a refusal does not. */
  async send(message: string, details: string): Promise<SendOutcome> {
    if (!this.canSend) return 'unavailable'
    const report: QueuedReport = {
      message: scrubText(message).slice(0, REPORT_LIMITS.message),
      details: scrubText(details).slice(0, REPORT_LIMITS.details),
      at: this.now().toISOString()
    }
    const result = await this.post(report)
    if (result === 'sent') return 'sent'
    if (result === 'refused') return 'unavailable'
    const queue = [...readQueue(this.opts.queueFile), report].slice(-REPORT_LIMITS.queued)
    writeQueue(this.opts.queueFile, queue)
    return 'queued'
  }

  /** Send what was kept, oldest first, stopping at the first network failure. Returns how many went. */
  async flushQueued(): Promise<number> {
    if (!this.canSend) return 0
    const queue = readQueue(this.opts.queueFile)
    let sent = 0
    for (const report of queue) {
      const result = await this.post(report)
      if (result === 'network') break
      sent++
    }
    if (sent > 0) writeQueue(this.opts.queueFile, queue.slice(sent))
    return sent
  }

  private async post(report: QueuedReport): Promise<'sent' | 'refused' | 'network'> {
    try {
      const res = await this.doFetch(`${this.opts.host.replace(/\/$/, '')}/capture/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: this.opts.apiKey,
          event: TELEMETRY_EVENTS.PROBLEM_REPORTED,
          distinct_id: this.opts.installId,
          timestamp: report.at,
          properties: {
            message: report.message,
            details: report.details,
            $process_person_profile: false,
            $geoip_disable: true
          }
        })
      })
      if (res.ok) return 'sent'
      return res.status >= 500 || res.status === 429 ? 'network' : 'refused'
    } catch (err) {
      logger.warn('Problem report could not be sent', err)
      return 'network'
    }
  }
}
