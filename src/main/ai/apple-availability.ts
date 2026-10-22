import type { NativeHelper } from '../native/helper'

/** Whether Apple's on-device model can run on this Mac right now. */
export interface AppleAvailability {
  available(): Promise<boolean>
}

export interface AppleAvailabilityDeps {
  helper: Pick<NativeHelper, 'info'>
  /** How long one answer is kept. Apple Intelligence can be switched on or off while the app runs. */
  ttlMs?: number
  now?: () => number
}

const FIVE_MINUTES = 5 * 60 * 1000

/**
 * Asks the Swift helper's `info` whether Foundation Models is available (macOS 27, an eligible Mac,
 * Apple Intelligence on, the model downloaded by macOS). No helper, a helper that fails, or any
 * other reason all read as unavailable, so the Apple model is simply not offered.
 */
export function createAppleAvailability(deps: AppleAvailabilityDeps): AppleAvailability {
  const ttlMs = deps.ttlMs ?? FIVE_MINUTES
  const now = deps.now ?? Date.now
  let cached: { at: number; answer: Promise<boolean> } | null = null

  return {
    available() {
      if (cached && now() - cached.at < ttlMs) return cached.answer
      const answer = deps.helper.info().then(
        (info) => info.foundationModels.available,
        () => false
      )
      cached = { at: now(), answer }
      return answer
    }
  }
}
