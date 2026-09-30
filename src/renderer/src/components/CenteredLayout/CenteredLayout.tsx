import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  CENTERED_LAYOUT_CONTRACT,
  CENTERED_LAYOUT_DEFAULTS,
  type CenteredLayoutContractProps
} from './CenteredLayout.types'
import { centeredLayoutVariants } from './CenteredLayout.variants'

export interface CenteredLayoutProps extends CenteredLayoutContractProps {
  className?: string
}

/**
 * CenteredLayout — Full-window layout without the sidebar (onboarding, boot, fatal errors): centred 560 content.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=216-1679
 */
export function CenteredLayout({ className, ...rest }: CenteredLayoutProps) {
  const props = { ...CENTERED_LAYOUT_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="CenteredLayout" on the root element.
  return (
    <ScaffoldStub
      contract={CENTERED_LAYOUT_CONTRACT}
      props={props}
      className={cn(centeredLayoutVariants({ variant: props.variant }), className)}
    />
  )
}
