import { qwenR3 } from './r3'

/** Round 3 free rein: ck-7b with the file name in the object question. */
export default qwenR3({ id: 'ck-7c', notes: 'ck-7b, file name in the object question.', mask: 'label', maskRule: true, checkCover: true, redo: true, objectHint: 'names' })
