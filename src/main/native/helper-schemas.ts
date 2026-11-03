import { z } from 'zod'

/**
 * The replies `designstash-helper` writes (native/designstash-helper/README.md), checked as they
 * arrive. They stay in the main process; nothing here crosses IPC.
 */

/** The protocol version this client speaks; `info().protocol` reports the helper's. */
export const HELPER_PROTOCOL = 1

export const HelperReplySchema = z.object({
  id: z.union([z.number(), z.string(), z.null()]),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional()
})

/** `[x, y, width, height]` as fractions of the image, origin top-left. */
const Box = z.tuple([z.number(), z.number(), z.number(), z.number()])

const Revisions = z.object({
  current: z.number(),
  default: z.number(),
  supported: z.array(z.number())
})

export const HelperInfoSchema = z.object({
  protocol: z.number(),
  os: z.string(),
  vision: z.record(z.string(), Revisions),
  foundationModels: z.object({
    available: z.boolean(),
    /** Why not: notMacOS27, appleIntelligenceNotEnabled, deviceNotEligible, modelNotReady or unknown. */
    reason: z.string().optional()
  }),
  ms: z.number()
})
export type HelperInfo = z.infer<typeof HelperInfoSchema>

export const OcrResultSchema = z.object({
  lines: z.array(z.object({ text: z.string(), confidence: z.number(), box: Box })),
  level: z.enum(['accurate', 'fast']),
  languageCorrection: z.boolean(),
  revision: z.number(),
  width: z.number(),
  height: z.number(),
  ms: z.number()
})
export type OcrResult = z.infer<typeof OcrResultSchema>

const Detection = z.object({ confidence: z.number(), box: Box })

export const PeopleResultSchema = z.object({
  peopleCount: z.number(),
  handCount: z.number(),
  people: z.array(Detection),
  hands: z.array(Detection),
  minConfidence: z.number(),
  ms: z.number()
})
export type PeopleResult = z.infer<typeof PeopleResultSchema>

export const FeaturePrintResultSchema = z.object({
  revision: z.number(),
  elementCount: z.number(),
  /** Base64, little-endian Float32. */
  data: z.string(),
  ms: z.number()
})
export type FeaturePrintResult = z.infer<typeof FeaturePrintResultSchema>

export const ClassifyResultSchema = z.object({
  labels: z.array(z.object({ label: z.string(), confidence: z.number() })),
  revision: z.number(),
  ms: z.number()
})
export type ClassifyResult = z.infer<typeof ClassifyResultSchema>

export const DescribeResultSchema = z.object({
  text: z.string(),
  /** True when a schema shaped the reply, so `text` is JSON. */
  json: z.boolean(),
  ms: z.number()
})
export type DescribeResult = z.infer<typeof DescribeResultSchema>
