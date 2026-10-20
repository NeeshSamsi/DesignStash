import { ICON_STROKE } from '@renderer/design-system/icon'
import type { ReactNode } from 'react'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@renderer/lib/utils'
import { TruncatedText } from '@renderer/lib/truncated-text'
import { PAGE_HEADER_DEFAULTS, type PageHeaderContractProps } from './PageHeader.types'
import {
  pageHeaderCurrentClass,
  pageHeaderDescriptionClass,
  pageHeaderRowClass,
  pageHeaderTitleVariants,
  pageHeaderVariants
} from './PageHeader.variants'

export interface PageHeaderProps extends PageHeaderContractProps {
  /** The trailing actions (buttons). Figma's `actions` boolean only says whether the area exists. */
  children?: ReactNode
  className?: string
  /** Makes the parent crumb a button that goes back (the pile page's “My Stash”). */
  onParent?: () => void
  /** Sits right after the description, e.g. a Clear link while a search is on. */
  descriptionAction?: ReactNode
}

/**
 * PageHeader — Breadcrumb title + description + trailing actions.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=216-1656
 * The header stays whatever the item count is: pass a description like "0 mockups" rather than
 * hiding it. The actions area renders when `children` are passed.
 */
export function PageHeader({
  children,
  className,
  onParent,
  descriptionAction,
  ...rest
}: PageHeaderProps) {
  const props = { ...PAGE_HEADER_DEFAULTS, ...rest }
  const page = props.variant === 'page'
  const Title = page ? 'h1' : 'h2'
  return (
    <header
      data-ds="PageHeader"
      className={cn(pageHeaderVariants({ variant: props.variant }), className)}
    >
      <div className={pageHeaderRowClass}>
        <Title className={pageHeaderTitleVariants({ variant: props.variant })}>
          {page && props.breadcrumb && (
            <>
              {onParent ? (
                <button
                  type="button"
                  onClick={onParent}
                  className="flex min-w-0 shrink-3 cursor-pointer rounded-sm outline-none hover:text-muted-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <TruncatedText>{props.parent}</TruncatedText>
                </button>
              ) : (
                <TruncatedText className="min-w-0 shrink-3">{props.parent}</TruncatedText>
              )}
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={ICON_STROKE}
                className="size-6 shrink-0"
                aria-hidden
              />
            </>
          )}
          <TruncatedText className={cn('min-w-0', page && pageHeaderCurrentClass)}>
            {props.current}
          </TruncatedText>
        </Title>
        {children !== undefined && children !== null && (
          <div data-slot="page-header-actions" className="flex shrink-0 items-start gap-2">
            {children}
          </div>
        )}
      </div>
      {props.showDescription &&
        (descriptionAction ? (
          <div className="flex items-center gap-2">
            <p className={pageHeaderDescriptionClass}>{props.description}</p>
            {descriptionAction}
          </div>
        ) : (
          <p className={pageHeaderDescriptionClass}>{props.description}</p>
        ))}
    </header>
  )
}
