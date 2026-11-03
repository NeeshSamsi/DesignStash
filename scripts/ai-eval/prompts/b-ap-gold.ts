import base from './ap-10s'
import { pileVersion } from './pile'

/** Round 3, experiment B, Apple: ap-10s with the top's approved words (its gold) as a reference, as the app does today once the top is stashed. */
export default pileVersion(base, { id: 'b-ap-gold', notes: 'ap-10s plus the stashed top (gold) as a reference (app wording).', reference: 'gold' })
