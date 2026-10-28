import type { NativeHelper } from '../native/helper'

/**
 * Why Apple's model can't run, in the helper's words: `notMacOS27`, `appleIntelligenceNotEnabled`,
 * `deviceNotEligible`, `modelNotReady`, or `unknown` (also when the helper is missing or fails).
 */
export interface AppleStatus {
  available: boolean
  reason: string | null
}

/** Whether Apple's on-device model can run on this Mac right now, and why not. */
export interface AppleAvailability {
  available(): Promise<boolean>
  status(): Promise<AppleStatus>
  /** Forget the answer, so the next question asks the helper (the model just said it can't run, H-1). */
  refresh(): void
}

export interface AppleAvailabilityDeps {
  helper: Pick<NativeHelper, 'info'>
  /** How long one answer is kept. Apple Intelligence can be switched on or off while the app runs. */
  ttlMs?: number
  /** How long an unavailable answer is kept, so a model switched back on is noticed soon. */
  unavailableTtlMs?: number
  now?: () => number
}

const FIVE_MINUTES = 5 * 60 * 1000
const ONE_MINUTE = 60 * 1000

/**
 * Asks the Swift helper's `info` whether Foundation Models is available (macOS 27, an eligible Mac,
 * Apple Intelligence on, the model downloaded by macOS). No helper, a helper that fails, or any
 * other reason all read as unavailable, so the Apple model is simply not offered.
 */
export function createAppleAvailability(deps: AppleAvailabilityDeps): AppleAvailability {
  const ttlMs = deps.ttlMs ?? FIVE_MINUTES
  const unavailableTtlMs = Math.min(deps.unavailableTtlMs ?? ONE_MINUTE, ttlMs)
  const now = deps.now ?? Date.now
  let cached: { at: number; answer: Promise<AppleStatus>; available?: boolean } | null = null

  function status(): Promise<AppleStatus> {
    const keep = cached?.available === false ? unavailableTtlMs : ttlMs
    if (cached && now() - cached.at < keep) return cached.answer
    const entry: NonNullable<typeof cached> = {
      at: now(),
      answer: deps.helper.info().then(
        ({ foundationModels: fm }): AppleStatus =>
          fm.available ? { available: true, reason: null } : { available: false, reason: fm.reason ?? 'unknown' },
        (): AppleStatus => ({ available: false, reason: 'unknown' })
      )
    }
    void entry.answer.then((s) => (entry.available = s.available))
    cached = entry
    return entry.answer
  }

  return {
    status,
    available: () => status().then((s) => s.available),
    refresh: () => {
      cached = null
    }
  }
}
