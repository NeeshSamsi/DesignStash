import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { MODAL_CONTRACT, MODAL_DEFAULTS, type ModalContractProps } from './Modal.types'
import { modalVariants } from './Modal.variants'

export interface ModalProps extends ModalContractProps {
  className?: string
}

/**
 * Modal — Base content dialog: header, scrolling body slot, ActionBar footer.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=216-780
 * Today: _legacy/Modal.tsx
 */
export function Modal({ className, ...rest }: ModalProps) {
  const props = { ...MODAL_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Modal" on the root element.
  return (
    <ScaffoldStub
      contract={MODAL_CONTRACT}
      props={props}
      className={cn(modalVariants({ size: props.size }), className)}
    />
  )
}
