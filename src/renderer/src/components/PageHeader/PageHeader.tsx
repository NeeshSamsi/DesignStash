import type { ReactNode } from 'react'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@renderer/lib/utils'
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
}

/**
 * PageHeader — Breadcrumb title + description + trailing actions.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=216-1656
 * The header stays whatever the item count is: pass a description like "0 mockups" rather than
 * hiding it. The actions area renders when `children` are passed.
 */
export function PageHeader({ children, className, ...rest }: PageHeaderProps) {
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
              <span className="truncate">{props.parent}</span>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={1.5}
                className="size-6 shrink-0"
                aria-hidden
              />
            </>
          )}
          <span className={cn('truncate', page && pageHeaderCurrentClass)}>{props.current}</span>
        </Title>
        {children !== undefined && children !== null && (
          <div className="flex shrink-0 items-start gap-2">{children}</div>
        )}
      </div>
      {props.showDescription && <p className={pageHeaderDescriptionClass}>{props.description}</p>}
    </header>
  )
}
