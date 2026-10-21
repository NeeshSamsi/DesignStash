import { makeV6 } from './v6'

/**
 * v7, the finalist: v4 plus only the changes that held up. No Angle (half the 7B's wrong tags in
 * v4), v5's quoted-text cut, and the mockup cut that leaves no holes. No keywords field: re-scoring
 * v6 without its keywords moved search by about a point on either model, and asking for keywords
 * took the other names out of the 7B's descriptions.
 */
export default makeV6(
  'v7',
  false,
  'v4 without Angle, with the quoted-text cut and the hole-free mockup cut. No keywords field.'
)
