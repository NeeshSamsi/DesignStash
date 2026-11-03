import { qwenR3 } from './r3'

/** Round 3 free rein, on ck-6lr: plus the object's name from the cover as it is (two looks for the name). */
export default qwenR3({ id: 'ck-7lr', notes: 'ck-6lr plus an object hint from the unmasked cover.', mask: 'label', maskRule: true, checkCover: true, redo: true, objectHint: true })
