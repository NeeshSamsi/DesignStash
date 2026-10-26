import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  TITLE_PAIR_CONTRACT,
  TITLE_PAIR_DEFAULTS,
  type TitlePairContractProps
} from './TitlePair.types'
import { titlePairVariants } from './TitlePair.variants'

export interface TitlePairProps extends TitlePairContractProps {
  className?: string
}

/**
 * TitlePair — The Title control for a mockup in a pile (Neesh, 2026-10-24): the pile’s base title, shared by every mockup in it (pile icon), then this mockup’s variation of 1 to 3 words, joined by a dot. Editing the base renames it on every mockup in the pile; the variation belongs to this mockup. Both Inputs are exposed, so each takes its own state (filled, focus, writing). Mockups on their own keep the single Title Input. size=compact gives the variation 120px, for narrow panels such as the details sidebar. The separator is a 4px round dot in text/secondary (in code: a span, size-1 rounded-full, filled with the text/secondary colour). Rules: design/specs/pile-titles.md.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=1160-26996
 */
export function TitlePair({ className, ...rest }: TitlePairProps) {
  const props = { ...TITLE_PAIR_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="TitlePair" on the root element.
  return (
    <ScaffoldStub
      contract={TITLE_PAIR_CONTRACT}
      props={props}
      className={cn(titlePairVariants({ size: props.size }), className)}
    />
  )
}
