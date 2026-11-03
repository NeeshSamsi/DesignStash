import { qwenR3 } from './r3'

/** Round 3 free rein, for the 9B: answer from the cover as it is, then check colour and pattern words on the soft-masked cover and ask again without the placeholder-only ones. */
export default qwenR3({ id: 'ck-9v', notes: 'ck-2 answer, verify colour and pattern words on the soft-masked cover, redo.', checkCover: true, redo: true, verify: 'soft' })
