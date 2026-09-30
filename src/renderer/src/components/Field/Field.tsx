import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { FIELD_CONTRACT, FIELD_DEFAULTS, type FieldContractProps } from './Field.types'
import { fieldVariants } from './Field.variants'

export interface FieldProps extends FieldContractProps {
  className?: string
}

/**
 * Field — Label + control + description + error, so validation always has words.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=212-273
 * Today: ui/field.tsx
 */
export function Field({ className, ...rest }: FieldProps) {
  const props = { ...FIELD_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Field" on the root element.
  return (
    <ScaffoldStub
      contract={FIELD_CONTRACT}
      props={props}
      className={cn(
        fieldVariants({ orientation: props.orientation, invalid: props.invalid }),
        className
      )}
    />
  )
}
