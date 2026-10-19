import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  PATH_FIELD_CONTRACT,
  PATH_FIELD_DEFAULTS,
  type PathFieldContractProps
} from './PathField.types'
import { pathFieldVariants } from './PathField.variants'

export interface PathFieldProps extends PathFieldContractProps {
  className?: string
}

/**
 * PathField — Where the stash lives during onboarding: friendly path + location, with Choose…. Errors: not writable, already a stash (→ ChoiceDialog), unavailable drive. Settings › My Stash has its own path field with Change….
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-3718
 */
export function PathField({ className, ...rest }: PathFieldProps) {
  const props = { ...PATH_FIELD_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="PathField" on the root element.
  return (
    <ScaffoldStub
      contract={PATH_FIELD_CONTRACT}
      props={props}
      className={cn(pathFieldVariants({ state: props.state }), className)}
    />
  )
}
