import { makeV3 } from './v3'

/**
 * v4: v3's fixes, minus the two that cost the 3B search hits. Stripping "mockup" from descriptions
 * left holes ("A laptop displaying a is placed"), so only titles and tags are cleaned. "Leave a
 * category out" made the 3B give one or two tags, so tags go back to v1's wording with at least
 * three in the grammar. And the product name comes from the names whenever the image shows that
 * kind of object, which brings back MacBook for the long-scroll set. With no usable image the 3B
 * invented a room for the placeholder MacBook, so that case now leaves the setting out.
 */
export const V4 = {
  productLine:
    'The image shows what the mockup is. When it shows the kind of product the names mention (a MacBook, an iPhone 16, an Apple Watch Ultra), use that product name.',
  noImageLine:
    'Describe the object the names point to, in your own words. You can\'t see the setting, so leave it out.',
  tagLine:
    '- tags: 3 to 6, each one thing that is really in the picture, in its category. Most mockups use only some categories.',
  stripDescription: false,
  minTags: 3
}

export default makeV3('v4', false, {
  ...V4,
  notes: 'v3b with junk stripped from titles and tags only, v1 tag wording with at least three tags, and product names taken from the names when the image shows that product.'
})
