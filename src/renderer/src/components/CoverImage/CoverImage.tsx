import { ICON_STROKE } from '@renderer/design-system/icon'
import type { ComponentProps } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Image01Icon, ImageNotFound01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@renderer/components/Button'
import { cn } from '@renderer/lib/utils'
import { COVER_IMAGE_DEFAULTS, type CoverImageContractProps } from './CoverImage.types'
import { coverDeviceVariants, coverIconVariants, coverImageVariants } from './CoverImage.variants'

export interface CoverImageProps
  extends CoverImageContractProps, Omit<ComponentProps<'div'>, keyof CoverImageContractProps> {
  /** The cover file. Without it a loaded cover shows the device placeholder. */
  src?: string
  /** Accessible name for the cover; leave empty when the title sits beside it. */
  alt?: string
  /** Classes for the <img>, such as the card's hover zoom. */
  imageClassName?: string
  /** Shows "Replace cover" on a large missing-file cover. */
  onReplace?: () => void
}

/**
 * CoverImage — The one way to render a mockup cover (4:3, plain rounded rectangle). loading is a plain
 * skeleton block in surface-3, never a spinner.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=217-1121
 * Used wherever a cover shows. The text labels show at md and lg only, as in Figma.
 */
export function CoverImage({
  className,
  src,
  alt = '',
  imageClassName,
  onReplace,
  ...rest
}: CoverImageProps) {
  const { size, state, ...props } = { ...COVER_IMAGE_DEFAULTS, ...rest }
  const showLabel = size === 'md' || size === 'lg'
  const missing = state === 'missing-file'

  return (
    <div
      data-ds="CoverImage"
      data-state={state}
      className={cn(coverImageVariants({ size, state }), className)}
      {...props}
    >
      {state === 'loaded' &&
        (src ? (
          <img
            src={src}
            alt={alt}
            loading="lazy"
            className={cn(
              'size-full object-cover transition-transform duration-(--duration-fast)',
              imageClassName
            )}
          />
        ) : (
          <div aria-hidden className={coverDeviceVariants({ size })}>
            <div className="size-full rounded-md bg-primary-weak" />
          </div>
        ))}
      {(state === 'no-preview' || missing) && (
        <>
          <HugeiconsIcon
            icon={missing ? ImageNotFound01Icon : Image01Icon}
            strokeWidth={ICON_STROKE}
            className={cn(coverIconVariants({ size }), missing ? 'text-error' : 'text-tertiary')}
          />
          {showLabel && (
            <p className={cn('type-caption-xs-regular', missing ? 'text-error' : 'text-tertiary')}>
              {missing ? 'Cover file missing' : 'No preview'}
            </p>
          )}
        </>
      )}
      {missing && size === 'lg' && onReplace && (
        <Button variant="secondary" size="xs" label="Replace cover" onClick={onReplace} />
      )}
    </div>
  )
}
