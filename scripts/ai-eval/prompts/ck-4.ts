import { CK2_THINGS, SURFACE_THINGS, qwenR3 } from './r3'

/** Round 3, experiment A, on ck-2: soft mask, and the scene check widened to surfaces and stands ("stack of" cut too). */
export default qwenR3({ id: 'ck-4', notes: 'ck-3s plus a wider scene-thing check.', mask: 'soft', things: [...CK2_THINGS, ...SURFACE_THINGS, 'paper'] })
