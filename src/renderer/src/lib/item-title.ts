import { fullTitle, variationHeading, type Variation } from '@shared/pile-variation'

/** What a mockup's title is made of: in a pile its `title` is the pile's base and `variation` its own part. */
interface Titled {
  title: string
  variation: Pick<Variation, 'words'> | null
}

/**
 * A mockup's name where its pile is already named around it (a card in the opened pile, the
 * sidebar heading, a toast on the pile page): its variation with a capital ("Side"), else its title.
 */
export const itemName = ({ title, variation }: Titled): string =>
  variation ? variationHeading(variation.words) : title

/** A mockup's full title where it stands alone (alt text, a lightbox caption): "base · variation". */
export const itemFullTitle = ({ title, variation }: Titled): string => fullTitle(title, variation)
