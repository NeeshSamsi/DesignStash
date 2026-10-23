import { qwenR3 } from './r3'

/** Round 3 free rein, for the 9B: ck-2's answer; when a colour or pattern word is only on the placeholder, answer again from the labelled cover, named from the first title. */
export default qwenR3({ id: 'ck-9m', notes: 'ck-2 answer, verify on the soft-masked cover, remask with the label when the placeholder was described.', checkCover: true, redo: true, verify: 'soft', remaskWith: 'label' })
