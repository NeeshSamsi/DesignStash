import { VARIANT_OWN_SCENE, pileVersion } from './pile'
import { qwenR3 } from './r3'

/** Round 3, experiment B, 4B: as b-4b, told the variant's own scene may differ from the top's. */
const base = qwenR3({ id: 'ck-7b', notes: 'ck-7b with the own-scene variant rule.', mask: 'label', maskRule: true, checkCover: true, redo: true, objectHint: true, variantRule: VARIANT_OWN_SCENE })
export default pileVersion(base, { id: 'b-4b-own', notes: 'ck-7b plus the top as a reference, own-scene wording.', topsFrom: 'ck-7b' })
