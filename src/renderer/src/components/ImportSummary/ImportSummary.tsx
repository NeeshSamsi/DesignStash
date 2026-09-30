import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  IMPORT_SUMMARY_CONTRACT,
  IMPORT_SUMMARY_DEFAULTS,
  type ImportSummaryContractProps
} from './ImportSummary.types'
import { importSummaryVariants } from './ImportSummary.variants'

export interface ImportSummaryProps extends ImportSummaryContractProps {
  className?: string
}

/**
 * ImportSummary — What happened before grouping: StatTiles, skipped-file rows, next action.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=220-2945
 */
export function ImportSummary({ className, ...rest }: ImportSummaryProps) {
  const props = { ...IMPORT_SUMMARY_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="ImportSummary" on the root element.
  return (
    <ScaffoldStub
      contract={IMPORT_SUMMARY_CONTRACT}
      props={props}
      className={cn(importSummaryVariants({ variant: props.variant }), className)}
    />
  )
}
