import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { TAG_TREE_CONTRACT, TAG_TREE_DEFAULTS, type TagTreeContractProps } from './TagTree.types'
import { tagTreeVariants } from './TagTree.variants'

export interface TagTreeProps extends TagTreeContractProps {
  className?: string
}

/**
 * TagTree — Manage the two-tier taxonomy with inline rename and row menus.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-5509
 * Today: SettingsTagsPane.tsx
 */
export function TagTree({ className, ...rest }: TagTreeProps) {
  const props = { ...TAG_TREE_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="TagTree" on the root element.
  return (
    <ScaffoldStub
      contract={TAG_TREE_CONTRACT}
      props={props}
      className={cn(tagTreeVariants({ state: props.state }), className)}
    />
  )
}
