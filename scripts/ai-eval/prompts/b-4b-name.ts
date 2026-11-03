import { pileVersion, productOnlyLines } from './pile'
import { qwenR3 } from './r3'

/** Round 3, experiment B, 4B: ck-7e told only the product names in the top's suggestion. */
const base = qwenR3({ id: 'ck-7e', notes: 'ck-7e with product-only variant lines.', mask: 'label', maskRule: true, checkCover: true, redo: true, objectHint: true, blankFallback: 'soft', variantLines: productOnlyLines })
export default pileVersion(base, { id: 'b-4b-name', notes: 'ck-7e plus the top\'s product names alone.', topsFrom: 'ck-7e-merged' })
