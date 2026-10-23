import { CK2_THINGS, SURFACE_THINGS, appleR3 } from './r3'

/** Round 3, experiment A, on ap-6: ap-8 plus real other names only in "also called". */
export default appleR3({ id: 'ap-9', notes: 'ap-8 plus the alternates rule.', mask: 'soft', things: [...CK2_THINGS, ...SURFACE_THINGS, 'paper'], alternates: true })
