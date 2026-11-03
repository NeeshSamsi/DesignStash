import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { TEXTAREA_CONTRACT, TEXTAREA_DEFAULTS, type TextareaContractProps } from './Textarea.types'
import { textareaVariants } from './Textarea.variants'

export interface TextareaProps extends TextareaContractProps {
  className?: string
}

/**
 * Textarea — Multi-line description field (auto-grow is behaviour).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=212-205
 * Today: ui/textarea.tsx
 */
export function Textarea({ className, ...rest }: TextareaProps) {
  const props = { ...TEXTAREA_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Textarea" on the root element.
  return (
    <ScaffoldStub
      contract={TEXTAREA_CONTRACT}
      props={props}
      className={cn(textareaVariants(), className)}
    />
  )
}
