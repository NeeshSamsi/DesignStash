import { useState, type ChangeEvent, type ComponentProps } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { KeyboardShortcut } from '@renderer/components/KeyboardShortcut'
import { cn } from '@renderer/lib/utils'
import { InputGroup, InputGroupInput, Input as UiInput } from '@renderer/ui/input'
import { INPUT_DEFAULTS, type InputContractProps } from './Input.types'

export interface InputProps
  extends InputContractProps,
    Omit<ComponentProps<'input'>, keyof InputContractProps | 'defaultValue'> {
  /** search: called by the clear button (shown while there is text). */
  onClear?: () => void
  /** search: the hint at the end of the field. */
  shortcut?: string
}

/**
 * Input — Single-line text entry. search = title-bar field (icon + ⌘K); inline-title = the Detail title field.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=212-190
 * Styles live in ui/input.tsx (search uses its InputGroup); this maps the Figma props onto it.
 * Figma's empty/filled state is the value itself. Pass onChange to control `value`; without it,
 * `value` is only the starting text.
 */
export function Input({ className, onChange, onClear, shortcut = '⌘K', ...rest }: InputProps) {
  const { variant, showIconStart, value, iconStart, ...props } = { ...INPUT_DEFAULTS, ...rest }
  const [draft, setDraft] = useState(value)
  const current = onChange ? value : draft
  const change = (event: ChangeEvent<HTMLInputElement>) =>
    onChange ? onChange(event) : setDraft(event.target.value)

  if (variant !== 'search' && !showIconStart) {
    return (
      <UiInput
        data-ds="Input"
        variant={variant === 'inline-title' ? 'inline-title' : 'default'}
        value={current}
        onChange={change}
        className={className}
        {...props}
      />
    )
  }

  const search = variant === 'search'
  const clear = () => {
    if (!onChange) setDraft('')
    onClear?.()
  }
  return (
    <InputGroup data-ds="Input" data-variant={variant} className={className}>
      {showIconStart && (
        <HugeiconsIcon icon={iconStart} strokeWidth={1.5} className="size-4 text-tertiary" />
      )}
      <InputGroupInput
        value={current}
        onChange={change}
        className={cn(!search && 'type-body-sm-regular placeholder:text-placeholder')}
        {...props}
      />
      {search && current !== '' && (
        <button
          type="button"
          aria-label="Clear search"
          disabled={props.disabled}
          onClick={clear}
          className="rounded-sm text-tertiary outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} className="size-4" />
        </button>
      )}
      {search && <KeyboardShortcut variant="plain" keys={shortcut} />}
    </InputGroup>
  )
}
