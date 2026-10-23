import base from './ck-7e'
import { pileVersion } from './pile'

/** Round 3, experiment B, 4B: ck-7e with the top's approved words (its gold) as a reference, as the app does today once the top is stashed. */
export default pileVersion(base, { id: 'b-4b-gold', notes: 'ck-7e plus the stashed top (gold) as a reference (app wording).', reference: 'gold' })
