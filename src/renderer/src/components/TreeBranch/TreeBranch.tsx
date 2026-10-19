import { cn } from '@renderer/lib/utils'
import { TREE_BRANCH_DEFAULTS, type TreeBranchContractProps } from './TreeBranch.types'
import {
  treeBranchCurveClass,
  treeBranchLineClass,
  treeBranchVariants
} from './TreeBranch.variants'

export interface TreeBranchProps extends TreeBranchContractProps {
  className?: string
}

/**
 * TreeBranch — Curved tree connector for nested nav rows; middle continues, last stops at the curve.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=233-4667
 * Used by SidebarNav (My Stash › Starred / All), unrelated to tags.
 */
export function TreeBranch({ className, ...rest }: TreeBranchProps) {
  const props = { ...TREE_BRANCH_DEFAULTS, ...rest }
  return (
    <div
      data-ds="TreeBranch"
      data-position={props.position}
      aria-hidden="true"
      className={cn(treeBranchVariants({ position: props.position }), className)}
    >
      <span className={treeBranchCurveClass} />
      {props.position === 'middle' && <span className={treeBranchLineClass} />}
    </div>
  )
}
