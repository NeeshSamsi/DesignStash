import { pileVersion, productOnlyLines } from './pile'
import { appleR3 } from './r3'

/** Round 3, experiment B, Apple: ap-10s told only the product names among the stashed top's approved tags (its gold). */
const base = appleR3({ id: 'ap-10s', notes: 'ap-10s with product-only variant lines.', mask: 'soft', checkCover: true, redo: true, variantLines: productOnlyLines })
export default pileVersion(base, { id: 'b-ap-goldname', notes: 'ap-10s plus the stashed top\'s (gold) product names alone.', reference: 'gold' })
