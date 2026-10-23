import { appleR3 } from './r3'
import { VARIANT_OWN_SCENE, pileVersion } from './pile'

/** Round 3, experiment B, Apple: as b-ap, told the variant's own scene may differ from the top's. */
const base = appleR3({ id: 'ap-10s', notes: 'ap-10s with the own-scene variant rule.', mask: 'soft', checkCover: true, redo: true, variantRule: VARIANT_OWN_SCENE })
export default pileVersion(base, { id: 'b-ap-own', notes: 'ap-10s plus the top as a reference, own-scene wording.', topsFrom: 'ap-10s' })
