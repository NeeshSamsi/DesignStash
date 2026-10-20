import type { ComponentProps } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Crown03Icon } from '@hugeicons/core-free-icons'
import { CoverImage } from '@renderer/components/CoverImage'
import { cn } from '@renderer/lib/utils'
import { VARIANT_THUMB_DEFAULTS, type VariantThumbContractProps } from './VariantThumb.types'
import { variantThumbLabelVariants, variantThumbVariants } from './VariantThumb.variants'

export interface VariantThumbProps
  extends
    VariantThumbContractProps,
    Omit<ComponentProps<'button'>, keyof VariantThumbContractProps> {
  /** The variant's cover file. Without it the thumb shows the device placeholder. */
  coverSrc?: string
}

/**
 * VariantThumb — One variant in a pile's VariantStrip: its cover in an 84×64 ring, its name,
 * and the crown-03 Top mark when it is the top mockup.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=751-7393
 * Part of VariantStrip. Click shows that variant; `shown` is the one on the cover.
 */
export function VariantThumb({ className, coverSrc, ...rest }: VariantThumbProps) {
  const { state, top, label, ...props } = { ...VARIANT_THUMB_DEFAULTS, ...rest }
  return (
    <button
      type="button"
      data-ds="VariantThumb"
      data-state={state}
      aria-current={state === 'shown' ? 'true' : undefined}
      className={cn(
        'group/thumb flex w-variant-thumb shrink-0 flex-col gap-1 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
      {...props}
    >
      <span className={variantThumbVariants({ state })}>
        <CoverImage
          size="sm"
          state={state === 'missing-cover' ? 'missing-file' : 'loaded'}
          {...(coverSrc ? { src: coverSrc } : {})}
          className="size-full"
        />
      </span>
      <span className="flex items-center gap-1">
        {top && (
          <HugeiconsIcon
            icon={Crown03Icon}
            strokeWidth={1.25}
            data-top-mark=""
            className="size-2.5 shrink-0 text-tertiary"
          />
        )}
        <span className={variantThumbLabelVariants({ state })}>{label}</span>
      </span>
    </button>
  )
}
