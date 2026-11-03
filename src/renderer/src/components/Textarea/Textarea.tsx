import { useState, type ChangeEvent, type ComponentProps } from 'react'
import { cn } from '@renderer/lib/utils'
import { useWritingField } from '@renderer/lib/writing-field'
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
 * the starting text. `writing` works as Input's; `ai-filled` tints a field the AI just filled.
 */
export function Textarea({ onChange, ...rest }: TextareaProps) {
  const { value, rowRange, state, className, ...props } = { ...TEXTAREA_DEFAULTS, ...rest }
  const [draft, setDraft] = useState(value)
  const ai = useWritingField(state === 'writing', !!onChange)
  return (
    <UiTextarea
      data-ds="Textarea"
      data-state={state}
      className={cn(
        textareaVariants({ rowRange, state: ai.active || state !== 'writing' ? state : 'default' }),
        className
      )}
      value={ai.active ? '' : onChange ? value : draft}
      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
        if (onChange) return onChange(event)
        ai.markTyped()
        setDraft(event.target.value)
      }}
      {...props}
      {...ai.props}
    />
  )
}
