import check512 from './sp-check512'

/** Round 4, 4B speed: sp-check512's second and third passes (`--seed-base 43 --repeat 2`). */
export default { ...check512, id: 'sp-check512-s43', notes: 'The scene checks on a 512 px cover, seeds 43 and 44.' }
