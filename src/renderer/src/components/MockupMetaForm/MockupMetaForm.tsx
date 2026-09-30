import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  MOCKUP_META_FORM_CONTRACT,
  MOCKUP_META_FORM_DEFAULTS,
  type MockupMetaFormContractProps
} from './MockupMetaForm.types'
import { mockupMetaFormVariants } from './MockupMetaForm.variants'

export interface MockupMetaFormProps extends MockupMetaFormContractProps {
  className?: string
}

/**
 * MockupMetaForm — One title / description / tags editor for approval and detail.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=222-3346
 */
export function MockupMetaForm({ className, ...rest }: MockupMetaFormProps) {
  const props = { ...MOCKUP_META_FORM_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="MockupMetaForm" on the root element.
  return (
    <ScaffoldStub
      contract={MOCKUP_META_FORM_CONTRACT}
      props={props}
      className={cn(
        mockupMetaFormVariants({ variant: props.variant, state: props.state }),
        className
      )}
    />
  )
}
