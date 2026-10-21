import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

/** What Apple's Vision found on one cover, written by the orchestrator's Swift tool. Every field is optional and unknown ones are kept. */
export const VisionDataSchema = z.looseObject({
  /** Recognised text lines. `box` is x, y, width, height as fractions of the image. */
  ocr: z
    .array(
      z.looseObject({
        text: z.string(),
        conf: z.number().optional(),
        box: z.array(z.number()).optional()
      })
    )
    .optional(),
  /** Image classification labels, best first. */
  classify: z.array(z.looseObject({ label: z.string(), conf: z.number().optional() })).optional(),
  hands: z.number().optional(),
  people: z.number().optional(),
  /** Image width and height in pixels. */
  size: z.array(z.number()).optional(),
  /** How long the Vision requests took. */
  ms: z.number().optional()
})

export type VisionData = z.infer<typeof VisionDataSchema>

/** `<coversDir>/<id>/vision.json`, parsed. Undefined when the file isn't there; throws, naming it, when it can't be read. */
export function readVision(coversDir: string, id: string): VisionData | undefined {
  const path = join(coversDir, id, 'vision.json')
  if (!existsSync(path)) return undefined
  let json: unknown
  try {
    json = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    throw new Error(`${path} is not JSON: ${(err as Error).message}`, { cause: err })
  }
  const parsed = VisionDataSchema.safeParse(json)
  if (!parsed.success) throw new Error(`${path} is not vision data: ${parsed.error.message}`)
  return parsed.data
}
