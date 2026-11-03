import { makeV3 } from './v3'
import { V4 } from './v4'

/** v4 with the seen field, in case looking first pays off once the rest is fixed. */
export default makeV3('v4s', true, { ...V4, notes: 'v4 with the seen field.' })
