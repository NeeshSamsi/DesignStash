import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  PAGE_HEADER_CONTRACT,
  PAGE_HEADER_DEFAULTS,
  type PageHeaderContractProps
} from './PageHeader.types'
import { pageHeaderVariants } from './PageHeader.variants'

export interface PageHeaderProps extends PageHeaderContractProps {
  className?: string
}

/**
 * PageHeader — Breadcrumb title + description + trailing actions.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=216-1656
 */
export function PageHeader({ className, ...rest }: PageHeaderProps) {
  const props = { ...PAGE_HEADER_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="PageHeader" on the root element.
  return (
    <ScaffoldStub
      contract={PAGE_HEADER_CONTRACT}
      props={props}
      className={cn(pageHeaderVariants({ variant: props.variant }), className)}
    />
  )
}
