// Text style rules for build-tokens.mjs: which family is the display face, which CSS variable a
// style uses, its weight and line height, and the font stack. Pure, so fonts.test.ts can check them.

/** Figma style names → CSS weights. Inter spells them with a space, newer fonts without. */
const WEIGHT = {
  Thin: 100,
  'Extra Light': 200,
  ExtraLight: 200,
  Light: 300,
  Regular: 400,
  Medium: 500,
  'Semi Bold': 600,
  SemiBold: 600,
  Bold: 700,
  'Extra Bold': 800,
  ExtraBold: 800,
  Black: 900
}

export const weightOf = (style) => WEIGHT[style] ?? 400

/**
 * A percentage line height (Figma's lineHeightPercent, 140 for 140%) becomes unitless (1.4), so it
 * scales with the font size. Figma stores percentages as floats (130.00000476837158), hence the
 * rounding. Without one, px; without either, normal.
 */
export function lineHeightOf({ lineHeight, lineHeightPercent }) {
  if (lineHeightPercent != null) return String(Math.round(lineHeightPercent * 100) / 10000)
  return lineHeight ? `${lineHeight}px` : 'normal'
}

/** The display family is the one the display/* styles use; body is the body/* styles' family. */
export function fontFamilies(textStyles) {
  const byRole = {}
  for (const s of textStyles) byRole[s.name.split('/')[0]] ??= s.family
  return { display: byRole.display ?? byRole.body, body: byRole.body }
}

/**
 * A style set in the display family uses the display font (titles included); every other style
 * uses the body font. With one family for both, the style's role decides.
 */
export function fontVariable(style, { display, body }) {
  const useDisplay =
    display === body ? style.name.split('/')[0] === 'display' : style.family === display
  return useDisplay ? '--ds-font-display' : '--ds-font-body'
}

// The bundled font first: @fontsource-variable registers it as '<Family> Variable'.
export const fontStack = (f) => `'${f} Variable', '${f}', ui-sans-serif, system-ui, sans-serif`
