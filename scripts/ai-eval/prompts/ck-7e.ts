import { qwenR3 } from './r3'

/** Round 3 free rein, for the 4B: ck-7b, with the soft fill where the label leaves a cover too blank to show. */
export default qwenR3({ id: 'ck-7e', notes: 'ck-7b, soft fill where the labelled cover is too blank to show.', mask: 'label', maskRule: true, checkCover: true, redo: true, objectHint: true, blankFallback: 'soft' })
