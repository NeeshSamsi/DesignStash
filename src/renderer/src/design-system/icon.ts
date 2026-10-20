import { TOKENS } from './tokens.generated'

/** Stroke width for every Hugeicons glyph (Figma icon-stroke/default). Pass it as `strokeWidth`. */
export const ICON_STROKE: number = TOKENS.numbers.find(
  (n) => n.name === 'icon-stroke/default'
)!.value
