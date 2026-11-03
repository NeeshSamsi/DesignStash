import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { INPUT_CONTRACT, INPUT_DEFAULTS, type InputContractProps } from './Input.types'
import { inputVariants } from './Input.variants'

export interface InputProps extends InputContractProps {
  className?: string
}

/**
 * Input — Single-line text entry. search = title-bar field (icon + ⌘K); inline-title = borderless editable title.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=212-190
 * Today: ui/input.tsx + input-group
 */
export function Input({ className, ...rest }: InputProps) {
  const props = { ...INPUT_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Input" on the root element.
  return (
    <ScaffoldStub
      contract={INPUT_CONTRACT}
      props={props}
      className={cn(inputVariants({ variant: props.variant }), className)}
    />
  )
}
