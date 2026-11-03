import { z } from 'zod'

/**
 * Telemetry event taxonomy + payload types (spec §13 / §13.3 / §13.3a).
 *
 * PRIVACY RULE — telemetry is pseudonymous and counts-only. The following must
 * NEVER be sent in any event or prop:
 *   - absolute paths or filenames
 *   - PSD imagery / thumbnails / any pixel data
 *   - AI-generated titles or tags
 *   - search query text
 *   - file, folder or library names, and the user's own words
 * ONLY non-PII primitives are permitted: counts, durations (ms), enums, and
 * hardware tiers. Error payloads must additionally be scrubbed of absolute paths.
 */

/** Canonical analytics events (spec §13 starter taxonomy). Add new names here only. */
export const TELEMETRY_EVENTS = {
  APP_OPENED: 'app_opened',
  IMPORT_STARTED: 'import_started',
  IMPORT_COMPLETED: 'import_completed',
  GROUP_CONFIRMED: 'group_confirmed',
  AI_ITEM_APPROVED: 'ai_item_approved',
  AI_ITEM_SKIPPED: 'ai_item_skipped',
  SUGGESTION_EDITED: 'suggestion_edited',
  FIRST_SUGGESTION: 'first_suggestion',
  SEARCH_PERFORMED: 'search_performed',
  MODEL_TIER_CHOSEN: 'model_tier_chosen',
  MODEL_DOWNLOAD_FINISHED: 'model_download_finished',
  MODEL_DOWNLOAD_FAILED: 'model_download_failed',
  APP_CRASHED: 'app_crashed',
  PROBLEM_REPORTED: 'problem_reported'
} as const
export type TelemetryEventName = (typeof TELEMETRY_EVENTS)[keyof typeof TELEMETRY_EVENTS]

/** A count as a range, so the library's exact size is never sent. */
export function sizeBucket(n: number): string {
  if (n <= 0) return '0'
  if (n < 10) return '1-9'
  if (n < 50) return '10-49'
  if (n < 200) return '50-199'
  if (n < 1000) return '200-999'
  return '1000+'
}

/** Which field of a suggestion the person changed. */
export type SuggestionField = 'title' | 'description' | 'tags'

/** Event props are restricted to non-PII primitives. NEVER include paths, filenames, titles, tags, or imagery. */
export const TelemetryPropsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
export type TelemetryProps = z.infer<typeof TelemetryPropsSchema>

export const TelemetryEventSchema = z.object({
  event: z.string(), // should be a TelemetryEventName; kept string for forward-compat
  props: TelemetryPropsSchema.optional()
})
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>

export const TelemetryConsentSchema = z.object({ enabled: z.boolean() })
export type TelemetryConsent = z.infer<typeof TelemetryConsentSchema>
