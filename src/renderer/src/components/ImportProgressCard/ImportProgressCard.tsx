import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  IMPORT_PROGRESS_CARD_CONTRACT,
  IMPORT_PROGRESS_CARD_DEFAULTS,
  type ImportProgressCardContractProps
} from './ImportProgressCard.types'
import { importProgressCardVariants } from './ImportProgressCard.variants'

export interface ImportProgressCardProps extends ImportProgressCardContractProps {
  className?: string
}

/**
 * ImportProgressCard — Floating import status in ActivityDock; collapses to a pill.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=220-2403
 * Today: App.tsx inline card
 */
export function ImportProgressCard({ className, ...rest }: ImportProgressCardProps) {
  const props = { ...IMPORT_PROGRESS_CARD_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="ImportProgressCard" on the root element.
  return (
    <ScaffoldStub
      contract={IMPORT_PROGRESS_CARD_CONTRACT}
      props={props}
      className={cn(
        importProgressCardVariants({ variant: props.variant, state: props.state }),
        className
      )}
    />
  )
}
