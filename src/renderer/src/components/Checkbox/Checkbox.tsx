import type { ComponentProps } from 'react'
import { cn } from '@renderer/lib/utils'
import { Checkbox as UiCheckbox } from '@renderer/ui/checkbox'
import { CHECKBOX_DEFAULTS, type CheckboxContractProps } from './Checkbox.types'

type CheckedState = boolean | 'indeterminate'

export interface CheckboxProps
  extends CheckboxContractProps,
    Omit<
      ComponentProps<typeof UiCheckbox>,
      keyof CheckboxContractProps | 'checked' | 'defaultChecked'
    > {}

const CHECKED = { unchecked: false, checked: true, indeterminate: 'indeterminate' } as const

/**
 * Checkbox — Multi-select (tag filter rows), with an optional count.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=212-302
 * Styles live in ui/checkbox.tsx. Pass onCheckedChange to control `state`; without it, `state`
 * is only the starting value.
 */
export function Checkbox({ className, onCheckedChange, ...rest }: CheckboxProps) {
  const { state, showCount, label, count, ...props } = { ...CHECKBOX_DEFAULTS, ...rest }
  const checked: CheckedState = CHECKED[state]

  return (
    <label
      data-ds="Checkbox"
      className={cn(
        'inline-flex items-center gap-2 has-disabled:cursor-not-allowed has-disabled:opacity-50',
        className
      )}
    >
      {/* The row dims as a whole when disabled, as in Figma. */}
      <UiCheckbox
        {...(onCheckedChange ? { checked, onCheckedChange } : { defaultChecked: checked })}
        className="disabled:opacity-100"
        {...props}
      />
      <span className="type-body-sm-regular text-foreground">{label}</span>
      {showCount && <span className="type-caption-xs-regular text-tertiary">{count}</span>}
    </label>
  )
}
