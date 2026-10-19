import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Select as UiSelect
} from '@renderer/ui/select'
import { SELECT_DEFAULTS, type SelectContractProps } from './Select.types'

export interface SelectOption {
  value: string
  label: ReactNode
}

export interface SelectProps
  extends SelectContractProps,
    Omit<
      ComponentProps<typeof UiSelect>,
      keyof SelectContractProps | 'defaultValue' | 'defaultOpen' | 'children'
    > {
  /** The choices. Defaults to a single option, `value`. */
  options?: SelectOption[]
  placeholder?: string
  /** Applies to the trigger. Figma's trigger is 192px wide (w-48). */
  className?: string
  'aria-label'?: string
}

/**
 * Select — Dropdown choice (sort order, tag category).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=212-459
 * Styles live in ui/select.tsx (base → default). Pass onValueChange / onOpenChange to control
 * `value` / `open`; without them, they are only the starting values.
 */
export function Select({
  className,
  options,
  placeholder,
  onValueChange,
  onOpenChange,
  'aria-label': ariaLabel,
  ...rest
}: SelectProps) {
  const { size, open, value, ...props } = { ...SELECT_DEFAULTS, ...rest }
  const items = options ?? [{ value, label: value }]

  return (
    <UiSelect
      {...(onValueChange ? { value, onValueChange } : { defaultValue: value })}
      {...(onOpenChange ? { open, onOpenChange } : { defaultOpen: open })}
      {...props}
    >
      <SelectTrigger
        data-ds="Select"
        size={size === 'base' ? 'default' : 'sm'}
        aria-label={ariaLabel}
        className={cn('w-48', className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </UiSelect>
  )
}
