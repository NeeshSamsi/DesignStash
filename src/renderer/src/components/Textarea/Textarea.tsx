import { useState, type ChangeEvent, type ComponentProps } from 'react'
import { cn } from '@renderer/lib/utils'
import { Textarea as UiTextarea } from '@renderer/ui/textarea'
import { TEXTAREA_DEFAULTS, type TextareaContractProps } from './Textarea.types'
import { textareaVariants } from './Textarea.variants'

export interface TextareaProps
  extends
    TextareaContractProps,
    Omit<ComponentProps<'textarea'>, keyof TextareaContractProps | 'defaultValue'> {}

/**
 * Textarea — Multi-line description field (auto-grow is behaviour).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=212-205
 * Styles live in ui/textarea.tsx. Pass onChange to control `value`; without it, `value` is only
 * the starting text.
 */
export function Textarea({ onChange, ...rest }: TextareaProps) {
  const { value, rowRange, className, ...props } = { ...TEXTAREA_DEFAULTS, ...rest }
  const [draft, setDraft] = useState(value)
  return (
    <UiTextarea
      data-ds="Textarea"
      className={cn(textareaVariants({ rowRange }), className)}
      value={onChange ? value : draft}
      onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
        onChange ? onChange(event) : setDraft(event.target.value)
      }
      {...props}
    />
  )
}
