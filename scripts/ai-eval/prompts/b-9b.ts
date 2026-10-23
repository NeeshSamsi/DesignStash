import base from './ck-9d'
import { pileVersion } from './pile'

/** Round 3, experiment B, 9B: ck-9d (the 9B in the app) with the pile top's suggestion as a reference, in the app's words. */
export default pileVersion(base, { id: 'b-9b', notes: 'ck-9d plus the top as a reference (app wording).', topsFrom: 'ck-9d-merged' })
