import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  TAG_EDITOR_CONTRACT,
  TAG_EDITOR_DEFAULTS,
  type TagEditorContractProps
} from './TagEditor.types'
import { tagEditorVariants } from './TagEditor.variants'

export interface TagEditorProps extends TagEditorContractProps {
  className?: string
}

/**
 * TagEditor — Add/remove tags: removable chips, combobox, grouped suggestions, create-new flow.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=222-2959
 * Today: _legacy/TagEditor.tsx
 */
export function TagEditor({ className, ...rest }: TagEditorProps) {
  const props = { ...TAG_EDITOR_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="TagEditor" on the root element.
  return (
    <ScaffoldStub
      contract={TAG_EDITOR_CONTRACT}
      props={props}
      className={cn(tagEditorVariants({ variant: props.variant, state: props.state }), className)}
    />
  )
}
