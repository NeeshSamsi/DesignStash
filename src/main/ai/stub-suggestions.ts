import type { InferenceResult } from '@shared/inference'

/**
 * What the end-to-end stub answers for the real test-set files the specs import
 * (e2e/fixtures/real-mockups.ts), so their screenshots read like a real stash. Written from the
 * covers and the eval's reference answers (scripts/ai-eval/gold*.json), with variants told apart.
 * Keyed by file name without its extension. Any other file gets "Stub <file name>".
 */
export const STUB_SUGGESTIONS: Record<string, InferenceResult> = {
  'Macbook-Mockup-on-Rocks-Boho-Interior': {
    title: 'MacBook on a stone block in a boho interior',
    description: 'An open MacBook on a rough stone block, in front of a brick wall with plants.',
    tags: [
      { category: 'Device', label: 'MacBook' },
      { category: 'Environment', label: 'Indoor' },
      { category: 'Style', label: 'Realistic' }
    ]
  },
  Bus_Stop_Citylight_Mockup: {
    title: 'Blue poster in a bus shelter',
    description: 'A blue citylight poster in a glass bus shelter on a sunny street.',
    tags: [
      { category: 'Print & Branding', label: 'Poster' },
      { category: 'Environment', label: 'Outdoor' },
      { category: 'Style', label: 'Realistic' }
    ]
  },
  Free_iMac_Mockup_1: {
    title: 'Silver iMac with keyboard and mouse',
    description: 'A silver iMac seen from the front, with its keyboard and mouse, on light grey.',
    tags: [
      { category: 'Device', label: 'iMac' },
      { category: 'Angle', label: 'Front' },
      { category: 'Style', label: 'Minimal' }
    ]
  },
  Free_iMac_Mockup_2: {
    title: 'Silver iMac floating at an angle',
    description: 'A silver iMac tilted in the air, casting a soft shadow on light grey.',
    tags: [
      { category: 'Device', label: 'iMac' },
      { category: 'Environment', label: 'Floating perspective' },
      { category: 'Style', label: 'Minimal' }
    ]
  },
  Free_iMac_Mockup_3: {
    title: 'Silver iMac from the side',
    description: 'A silver iMac turned to the side, with its keyboard and mouse, on light grey.',
    tags: [
      { category: 'Device', label: 'iMac' },
      { category: 'Angle', label: 'Side' },
      { category: 'Style', label: 'Minimal' }
    ]
  },
  Matt_Can_Mockup: {
    title: 'Pink and white matte drink can',
    description: 'A tall matte drink can fading from pink to white, standing on white.',
    tags: [
      { category: 'Print & Branding', label: 'Packaging' },
      { category: 'Style', label: 'Minimal' }
    ]
  },
  Kraft_Paper_Food_Pack_Mockup: {
    title: 'Kraft paper stand-up pouch',
    description: 'A brown kraft paper food pouch with a zip top, standing on white.',
    tags: [
      { category: 'Print & Branding', label: 'Packaging' },
      { category: 'Print & Branding', label: 'Bag' },
      { category: 'Style', label: 'Minimal' }
    ]
  },
  Leggings_Mockup: {
    title: 'Blue to pink gradient leggings',
    description: 'A pair of leggings fading from blue to pink, shown on an invisible model.',
    tags: [
      { category: 'Angle', label: 'Front' },
      { category: 'Style', label: 'Colorful' },
      { category: 'Style', label: '3D render' }
    ]
  },
  'Matte Snack Bar Mockup': {
    title: 'Matte snack bar wrapper',
    description: 'A white matte snack bar wrapper lying flat on light grey.',
    tags: [
      { category: 'Print & Branding', label: 'Packaging' },
      { category: 'Style', label: 'Minimal' }
    ]
  },
  'Sticker Mockup': {
    title: 'Round sticker with a peeling corner',
    description: 'A round black and green sticker with its corner peeling up.',
    tags: [
      { category: 'Apparel', label: 'Sticker' },
      { category: 'Style', label: 'Colorful' }
    ]
  }
}

/** The stub's answer for a file: its believable one, or "Stub <file name>". */
export function stubSuggestion(fileName: string): InferenceResult {
  const stem = fileName.replace(/\.[^/.]+$/, '')
  return (
    STUB_SUGGESTIONS[stem] ?? {
      title: `Stub ${stem}`,
      description: `A stub description for ${stem}.`,
      tags: [{ category: 'Device', label: 'phone' }]
    }
  )
}
