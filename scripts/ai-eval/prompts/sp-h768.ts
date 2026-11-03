import { appR4, smallerHint } from './r4'

/** Round 4, 4B: the hint on a 768 px cover, between full size and sp-hc512's 512 px, and the checks at 512 px. */
export default appR4({ id: 'sp-h768', notes: 'The hint at 768 px and the checks at 512 px.', transform: smallerHint(768) })
