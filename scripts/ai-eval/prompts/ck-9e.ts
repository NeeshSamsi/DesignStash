import { qwenR3 } from './r3'

/** Round 3 free rein, for the 9B: ck-9d, with the soft fill where the label leaves a cover too blank to show. */
export default qwenR3({ id: 'ck-9e', notes: 'ck-9d, soft fill where the labelled cover is too blank to show.', checkCover: true, redo: true, verify: 'soft', remaskWith: 'label', remaskDraft: true, blankFallback: 'soft' })
