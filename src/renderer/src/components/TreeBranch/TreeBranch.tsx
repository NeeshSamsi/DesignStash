import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  TREE_BRANCH_CONTRACT,
  TREE_BRANCH_DEFAULTS,
  type TreeBranchContractProps
} from './TreeBranch.types'
import { treeBranchVariants } from './TreeBranch.variants'

export interface TreeBranchProps extends TreeBranchContractProps {
  className?: string
}

/**
 * TreeBranch — Curved tree connector for nested nav rows; middle continues, last stops at the curve.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=233-4667
 */
export function TreeBranch({ className, ...rest }: TreeBranchProps) {
  const props = { ...TREE_BRANCH_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="TreeBranch" on the root element.
  return (
    <ScaffoldStub
      contract={TREE_BRANCH_CONTRACT}
      props={props}
      className={cn(treeBranchVariants({ position: props.position }), className)}
    />
  )
}
