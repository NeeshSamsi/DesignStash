import type { CoverChange } from '@shared/library'

type Refusal = Extract<CoverChange, { ok: false }>['reason']

/**
 * Why main kept the cover when the PSD's own preview was asked for, as the cover panel's error line.
 * A problem with a chosen file (not an image, too large, unreadable) keeps the panel's usual message.
 */
export function coverRefusal(reason: Refusal): string | undefined {
  if (reason === 'placeholder') {
    return 'The PSD’s own preview is only the kit’s “Delete this layer” notice, so this cover stays.'
  }
  if (reason === 'no-embedded') return 'This PSD has no preview of its own, so this cover stays.'
  return undefined
}
