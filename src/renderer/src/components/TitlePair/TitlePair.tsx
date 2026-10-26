import { useId, useState } from 'react'
import { Layers01Icon } from '@hugeicons/core-free-icons'
import { Input } from '@renderer/components/Input'
import type { InputState } from '@renderer/components/Input'
import { cn } from '@renderer/lib/utils'
import { TITLE_PAIR_DEFAULTS, type TitlePairContractProps } from './TitlePair.types'
import { titlePairVariationVariants, titlePairVariants } from './TitlePair.variants'

export interface TitlePairProps extends TitlePairContractProps {
  /** The pile's base title. Figma's sample until given. */
  baseValue?: string
  onBaseChange?: (base: string) => void
  /** This mockup's variation. Figma's sample until given. */
  variationValue?: string
  onVariationChange?: (variation: string) => void
  /** The variation lost focus: an empty one takes its file marker or number back (pile-titles.md). */
  onVariationBlur?: () => void
  /** How many mockups the pile holds, for the base's focus hint. */
  pileCount?: number
  /** Each part's own state: writing while the AI writes it, ai-filled as it lands. */
  baseState?: InputState
  variationState?: InputState
  /** Labels the pair, e.g. the Field's "Title" label. */
  baseId?: string
  className?: string
}

/**
 * TitlePair — The Title control for a mockup in a pile: the pile's base title, shared by every mockup in
 * it (the pile icon), a 4px dot in text/secondary, then this mockup's variation (180px, 120px compact).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=1160-26996
 * Rules: design/specs/pile-titles.md. Editing the base renames it on every mockup in the pile, so it
 * says so under the pair while it has focus. An empty variation suggests "1 to 3 words". The `base`
 * and `variation` slots stand in for the two Inputs (catalog).
 */
export function TitlePair({
  className,
  baseValue = 'Clay iPhone 15 Pro',
  onBaseChange,
  variationValue = 'side',
  onVariationChange,
  onVariationBlur,
  pileCount = 4,
  baseState = 'default',
  variationState = 'default',
  baseId,
  ...rest
}: TitlePairProps) {
  const { size, base, variation } = { ...TITLE_PAIR_DEFAULTS, ...rest }
  const hintId = useId()
  const [baseFocused, setBaseFocused] = useState(false)

  return (
    <div data-ds="TitlePair" data-size={size} className={cn('flex flex-col gap-2', className)}>
      <div className={titlePairVariants({ size })}>
        {base ?? (
          <Input
            {...(baseId ? { id: baseId } : {})}
            aria-label="Base title"
            showIconStart
            iconStart={Layers01Icon}
            value={baseValue}
            state={baseState}
            className="min-w-0 flex-1"
            {...(baseFocused ? { 'aria-describedby': hintId } : {})}
            onFocus={() => setBaseFocused(true)}
            onBlur={() => setBaseFocused(false)}
            {...(onBaseChange && { onChange: (event) => onBaseChange(event.target.value) })}
          />
        )}
        <span
          aria-hidden
          data-slot="title-pair-dot"
          className="size-1 shrink-0 rounded-full bg-muted-foreground"
        />
        {variation ?? (
          <Input
            aria-label="Variation"
            placeholder="1 to 3 words"
            value={variationValue}
            state={variationState}
            className={titlePairVariationVariants({ size })}
            {...(onVariationBlur && { onBlur: onVariationBlur })}
            {...(onVariationChange && {
              onChange: (event) => onVariationChange(event.target.value)
            })}
          />
        )}
      </div>
      {baseFocused && (
        <p id={hintId} className="type-caption-xs-regular text-tertiary">
          Renames the pile: all {pileCount} mockups.
        </p>
      )}
    </div>
  )
}
