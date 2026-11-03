import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  MOCKUP_GRID_CONTRACT,
  MOCKUP_GRID_DEFAULTS,
  type MockupGridContractProps
} from './MockupGrid.types'
import { mockupGridVariants } from './MockupGrid.variants'

export interface MockupGridProps extends MockupGridContractProps {
  className?: string
}

/**
 * MockupGrid — Fill-width wrapping grid of MockupCards with loading / empty / no-results / error slots.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=217-1902
 * Today: MockupGrid.tsx
 */
export function MockupGrid({ className, ...rest }: MockupGridProps) {
  const props = { ...MOCKUP_GRID_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="MockupGrid" on the root element.
  return (
    <ScaffoldStub
      contract={MOCKUP_GRID_CONTRACT}
      props={props}
      className={cn(mockupGridVariants({ state: props.state }), className)}
    />
  )
}
