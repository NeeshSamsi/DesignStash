import base from './ck-9d'
import { pileVersion } from './pile'

/** Round 3, experiment B, 9B: ck-9d with the top's approved words (its gold) as a reference, as the app does today once the top is stashed. */
export default pileVersion(base, { id: 'b-9b-gold', notes: 'ck-9d plus the stashed top (gold) as a reference (app wording).', reference: 'gold' })
