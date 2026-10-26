import { appR4, smallerHint } from './r4'

/**
 * Round 4, 4B: sp-hc512 with a hint that names each kind of object in a set ("notebook and
 * business cards"), so a stationery set stays a set.
 */
export default appR4({
  id: 'sp-hcall',
  notes: 'The hint and checks at 512 px, the hint naming every object in a set.',
  transform: smallerHint(
    512,
    'What kind of object is this mockup of? Give its everyday name in one to three words, plural if there are several of it. When it shows a set of different objects, name each kind, joined by "and" (notebook and business cards). No colours, brands, printed words or setting.'
  )
})
