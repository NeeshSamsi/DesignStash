import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { TOAST_CONTRACT, TOAST_DEFAULTS, type ToastContractProps } from './Toast.types'
import { toastVariants } from './Toast.variants'

export interface ToastProps extends ToastContractProps {
  className?: string
}

/**
 * Toast — Transient confirmation with optional action (Undo / Open / Retry). Lives in ActivityDock.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=213-905
 * Today: ui/sonner.tsx + stores/toastStore.ts
 */
export function Toast({ className, ...rest }: ToastProps) {
  const props = { ...TOAST_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Toast" on the root element.
  return (
    <ScaffoldStub
      contract={TOAST_CONTRACT}
      props={props}
      className={cn(toastVariants({ variant: props.variant }), className)}
    />
  )
}
