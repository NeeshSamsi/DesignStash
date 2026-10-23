import base from './ap-10s'
import { pileVersion } from './pile'

/** Round 3, experiment B, Apple: ap-10s with the pile top's suggestion as a reference, in the app's words. */
export default pileVersion(base, { id: 'b-ap', notes: 'ap-10s plus the top as a reference (app wording).' })
