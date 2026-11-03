import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  HARDWARE_SUMMARY_CONTRACT,
  HARDWARE_SUMMARY_DEFAULTS,
  type HardwareSummaryContractProps
} from './HardwareSummary.types'
import { hardwareSummaryVariants } from './HardwareSummary.variants'

export interface HardwareSummaryProps extends HardwareSummaryContractProps {
  className?: string
}

/**
 * HardwareSummary — This Mac and the model size it can run; warns on Intel and low disk.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-3780
 */
export function HardwareSummary({ className, ...rest }: HardwareSummaryProps) {
  const props = { ...HARDWARE_SUMMARY_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="HardwareSummary" on the root element.
  return (
    <ScaffoldStub
      contract={HARDWARE_SUMMARY_CONTRACT}
      props={props}
      className={cn(hardwareSummaryVariants({ variant: props.variant }), className)}
    />
  )
}
