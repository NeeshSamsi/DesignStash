import { COLOUR_WORDS } from '../object-colour'
import { appR4, smallerHint } from './r4'

/** The plain colour words (no regex fragments) and the settings they colour: "white background", "lavender surface". */
const SETTING_COLOURS = COLOUR_WORDS.filter((c) => /^[a-z ]+$/.test(c) && c !== 'dark').flatMap((c) =>
  ['background', 'backdrop', 'surface', 'wall', 'floor'].map((s) => `${c} ${s}`)
)

/**
 * Round 4, 4B: sp-hc512 plus a setting check. Each background or surface colour the answer gives
 * ("against a white background") is asked about on the 512 px cover as it is, as the scene things
 * are, and a "no" redoes the answer. For the lilac gift card holder called white.
 */
export default appR4({
  id: 'sp-hcset',
  notes: 'The hint and checks at 512 px, and the setting colours checked.',
  transform: smallerHint(512),
  moreSceneThings: SETTING_COLOURS
})
