/**
 * The Photoshop documents the app takes: a PSD, and a PSB, Photoshop's Large Document Format (the
 * same layered file with some section lengths in 8 bytes), taken exactly like a PSD (H-12).
 */
export const PHOTOSHOP_EXTENSIONS = ['psd', 'psb'] as const

/** Whether a file name is a PSD or a PSB, in any case. */
export const isPhotoshopFile = (name: string): boolean => /\.ps[db]$/i.test(name)

/** The copy's name in a mockup's folder. A PSB keeps its kind, so Photoshop opens it as it is. */
export const originalFileFor = (name: string): string =>
  /\.psb$/i.test(name) ? 'original.psb' : 'original.psd'

/** Whether a file in a mockup's folder is the app's copy of its document. */
export const isOriginalFile = (name: string): boolean => /^original\.ps[db]$/i.test(name)

/** Whether a file in a mockup's folder is a copy a crash cut off before it was whole. */
export const isCutOffOriginal = (name: string): boolean => /^original\.ps[db]\.part$/i.test(name)
