import { qwenR3 } from './r3'

/** Round 3 free rein: ck-7b's pipeline with the soft blur in place of the label (no mask rule). */
export default qwenR3({ id: 'ck-8s', notes: 'soft mask, check on the cover, redo, object hint.', mask: 'soft', checkCover: true, redo: true, objectHint: true })
