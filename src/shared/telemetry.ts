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
 * ONLY non-PII primitives are permitted: counts, durations (ms), enums, and
 * hardware tiers. Error payloads must additionally be scrubbed of absolute paths.
 */

/** Canonical analytics events (spec §13 starter taxonomy). Add new names here only. */
export const TELEMETRY_EVENTS = {
  IMPORT_STARTED: 'import_started',
  IMPORT_COMPLETED: 'import_completed',
  GROUP_CONFIRMED: 'group_confirmed',
  AI_ITEM_APPROVED: 'ai_item_approved',
  AI_ITEM_SKIPPED: 'ai_item_skipped',
  MANDATORY_UPLOAD_HIT: 'mandatory_upload_hit',
  SEARCH_PERFORMED: 'search_performed',
  MODEL_TIER_CHOSEN: 'model_tier_chosen'
} as const
export type TelemetryEventName = (typeof TELEMETRY_EVENTS)[keyof typeof TELEMETRY_EVENTS]

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
