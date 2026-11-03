import { pileVersion, productOnlyLines } from './pile'
import { appleR3 } from './r3'

/** Round 3, experiment B, Apple: ap-10s told only the product names in the top's suggestion. */
const base = appleR3({ id: 'ap-10s', notes: 'ap-10s with product-only variant lines.', mask: 'soft', checkCover: true, redo: true, variantLines: productOnlyLines })
export default pileVersion(base, { id: 'b-ap-name', notes: 'ap-10s plus the top\'s product names alone.' })
