import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { PRO_GATE_CONTRACT, PRO_GATE_DEFAULTS, type ProGateContractProps } from './ProGate.types'
import { proGateVariants } from './ProGate.variants'

export interface ProGateProps extends ProGateContractProps {
  className?: string
}

/**
 * ProGate — Wraps a Pro feature; locked shows the pitch + Upgrade (dormant in Phase 1).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-6940
 * Today: Locked.tsx
 */
export function ProGate({ className, ...rest }: ProGateProps) {
  const props = { ...PRO_GATE_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="ProGate" on the root element.
  return (
    <ScaffoldStub
      contract={PRO_GATE_CONTRACT}
      props={props}
      className={cn(
        proGateVariants({ variant: props.variant, unlocked: props.unlocked }),
        className
      )}
    />
  )
}
