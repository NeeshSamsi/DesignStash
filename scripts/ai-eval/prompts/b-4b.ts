import base from './ck-7e'
import { pileVersion } from './pile'

/** Round 3, experiment B, 4B: ck-7e (the 4B in the app) with the pile top's suggestion as a reference, in the app's words. */
export default pileVersion(base, { id: 'b-4b', notes: 'ck-7e plus the top as a reference (app wording).', topsFrom: 'ck-7e-merged' })
