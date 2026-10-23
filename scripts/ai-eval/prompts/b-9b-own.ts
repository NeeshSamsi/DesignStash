import { VARIANT_OWN_SCENE, pileVersion } from './pile'
import { qwenR3 } from './r3'

/** Round 3, experiment B, 9B: as b-9b, told the variant's own scene may differ from the top's. */
const base = qwenR3({ id: 'ck-9d', notes: 'ck-9d with the own-scene variant rule.', checkCover: true, redo: true, verify: 'soft', remaskWith: 'label', remaskDraft: true, variantRule: VARIANT_OWN_SCENE })
export default pileVersion(base, { id: 'b-9b-own', notes: 'ck-9d plus the top as a reference, own-scene wording.', topsFrom: 'ck-9d-merged' })
