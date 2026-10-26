import { EVERY_OBJECT_HINT, appR4, smallerHint } from './r4'

/** Round 4, 4B: the hint at 768 px naming every object in a set (sp-hcall's question, sp-h768's size). */
export default appR4({ id: 'sp-h768all', notes: 'The hint at 768 px, naming every object in a set.', transform: smallerHint(768, EVERY_OBJECT_HINT) })
