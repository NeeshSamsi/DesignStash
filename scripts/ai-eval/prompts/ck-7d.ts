import { qwenR3 } from './r3'

/** Round 3 free rein, for the 9B: ck-7b with a hint line that prefers a more exact name from the names. */
export default qwenR3({ id: 'ck-7d', notes: 'ck-7b, hint line prefers exact names.', mask: 'label', maskRule: true, checkCover: true, redo: true, objectHint: true, hintStyle: 'exact' })
