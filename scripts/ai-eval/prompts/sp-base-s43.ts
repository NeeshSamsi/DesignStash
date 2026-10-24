import { appR4 } from './r4'

/**
 * Round 4, 4B speed: the baseline's second and third passes (`--seed-base 43 --repeat 2`), which
 * join sp-base's first pass for three, as `--repeat 3` would have sampled them.
 */
export default appR4({ id: 'sp-base-s43', notes: 'Baseline: the app as it ships, seeds 43 and 44.' })
