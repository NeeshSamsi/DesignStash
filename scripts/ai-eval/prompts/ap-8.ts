import { CK2_THINGS, SURFACE_THINGS, appleR3 } from './r3'

/** Round 3, experiment A, on ap-6: soft mask, and the scene check widened to surfaces and stands ("stack of" cut too). */
export default appleR3({ id: 'ap-8', notes: 'ap-7s plus a wider scene-thing check.', mask: 'soft', things: [...CK2_THINGS, ...SURFACE_THINGS, 'paper'] })
