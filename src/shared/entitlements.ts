/**
 * Entitlements — deterministic, offline licensing layer (spec §14.3).
 *
 * NOT PostHog feature flags. Entitlements resolve from a local license/tier check
 * and are never tied to network analytics.
 */
import { z } from 'zod'

export const TIERS = ['free', 'pro'] as const
export type Tier = (typeof TIERS)[number]

/** Higher rank unlocks more. */
export function tierRank(t: Tier): number {
  return t === 'pro' ? 1 : 0
}

/** Feature keys — gate at call sites by key, never by scattered `if (paid)` checks. */
export const FEATURE_KEYS = {
  APP_CORE: 'app.core',
  MOCKUPS_UNLIMITED: 'mockups.unlimited',
  SEARCH_SEMANTIC: 'search.semantic',
  EXPORT_BATCH: 'export.batch',
  FONTS_IN_ACTION: 'fonts.inAction',
  FONTS_COMPARE: 'fonts.compare',
  FONTS_PAIRING: 'fonts.pairing',
  AI_BYOK_CLOUD: 'ai.byokCloud'
} as const
export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS]

/** Required tier per feature. PHASE 1: every key is 'free' (all unlocked) — bump to 'pro' later. */
export const FEATURE_REQUIRED_TIER: Record<FeatureKey, Tier> = {
  'app.core': 'free',
  'mockups.unlimited': 'free',
  'search.semantic': 'free',
  'export.batch': 'free',
  'fonts.inAction': 'free',
  'fonts.compare': 'free',
  'fonts.pairing': 'free',
  'ai.byokCloud': 'free'
}

/** Snapshot the renderer hydrates from (one IPC call). `enabled` maps each FeatureKey → boolean. */
export const EntitlementsSnapshotSchema = z.object({
  tier: z.enum(TIERS),
  enabled: z.record(z.string(), z.boolean())
})
export type EntitlementsSnapshot = z.infer<typeof EntitlementsSnapshotSchema>
