import { makeV5 } from './v5'

/** v5 with a one-sentence seen field, since looking first helped the 7B read the image in v3. */
export default makeV5('v5s', true)
