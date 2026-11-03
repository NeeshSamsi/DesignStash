import { pileVersion, productOnlyLines } from './pile'
import { qwenR3 } from './r3'

/** Round 3, experiment B, 9B: ck-9d told only the product names among the stashed top's approved tags (its gold). */
const base = qwenR3({ id: 'ck-9d', notes: 'ck-9d with product-only variant lines.', checkCover: true, redo: true, verify: 'soft', remaskWith: 'label', remaskDraft: true, variantLines: productOnlyLines })
export default pileVersion(base, { id: 'b-9b-goldname', notes: 'ck-9d plus the stashed top\'s (gold) product names alone.', reference: 'gold' })
