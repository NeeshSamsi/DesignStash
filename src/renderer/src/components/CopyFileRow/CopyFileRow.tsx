import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  COPY_FILE_ROW_CONTRACT,
  COPY_FILE_ROW_DEFAULTS,
  type CopyFileRowContractProps
} from './CopyFileRow.types'
import { copyFileRowVariants } from './CopyFileRow.variants'

export interface CopyFileRowProps extends CopyFileRowContractProps {
  className?: string
}

/**
 * CopyFileRow — One file in the copy widget: progress while copying, then what happened to it.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=372-5420
 */
export function CopyFileRow({ className, ...rest }: CopyFileRowProps) {
  const props = { ...COPY_FILE_ROW_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="CopyFileRow" on the root element.
  return (
    <ScaffoldStub
      contract={COPY_FILE_ROW_CONTRACT}
      props={props}
      className={cn(copyFileRowVariants({ state: props.state }), className)}
    />
  )
}
