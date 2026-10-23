import base from './ck-7b'
import { pileVersion } from './pile'

/** Round 3, experiment B, 4B: ck-7b with the pile top's suggestion as a reference, in the app's words. */
export default pileVersion(base, { id: 'b-4b', notes: 'ck-7b plus the top as a reference (app wording).' })
