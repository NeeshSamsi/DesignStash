import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { TAG_TREE_CONTRACT, TAG_TREE_DEFAULTS, type TagTreeContractProps } from './TagTree.types'
import { tagTreeVariants } from './TagTree.variants'

export interface TagTreeProps extends TagTreeContractProps {
  className?: string
}

/**
 * TagTree — Settings › Tags: one grouped container per category (name, tag count, ⋯), tag rows with use counts and a child on a tree branch, ⋯ on hover (Rename, Move to, Nest under, Merge into, Delete). Add tag closes each category and New category closes the list. Delete is instant with Undo; Merge and Delete category ask first. Rules: design/specs/settings.md.
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
