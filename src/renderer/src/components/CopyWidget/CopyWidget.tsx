import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  COPY_WIDGET_CONTRACT,
  COPY_WIDGET_DEFAULTS,
  type CopyWidgetContractProps
} from './CopyWidget.types'
import { copyWidgetVariants } from './CopyWidget.variants'

export interface CopyWidgetProps extends CopyWidgetContractProps {
  className?: string
}

/**
 * CopyWidget — Bottom-right copy panel (transport only): per-file and overall progress, failures inline, Cancel asks keep or undo, done collapses to a summary.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=373-5804
 */
export function CopyWidget({ className, ...rest }: CopyWidgetProps) {
  const props = { ...COPY_WIDGET_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="CopyWidget" on the root element.
  return (
    <ScaffoldStub
      contract={COPY_WIDGET_CONTRACT}
      props={props}
      className={cn(copyWidgetVariants({ view: props.view, state: props.state }), className)}
    />
  )
}
