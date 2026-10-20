import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import {
  RadioGroupItem,
  RadioGroup as UiRadioGroup,
  useInRadioGroup
} from '@renderer/ui/radio-group'
import { RADIO_GROUP_DEFAULTS, type RadioGroupContractProps } from './RadioGroup.types'

/** Wrap several RadioGroup items in this so they share one value. */
export { RadioGroup as RadioGroupRoot } from '@renderer/ui/radio-group'

export interface RadioGroupProps
  extends
    RadioGroupContractProps,
    Omit<ComponentProps<typeof RadioGroupItem>, keyof RadioGroupContractProps | 'value'> {
  /** The option's value inside a RadioGroupRoot. Defaults to `label`. */
  value?: string
  /** card: rich content (e.g. ModelRow) in place of the label and description. */
  children?: ReactNode
}

const LAYOUT = {
  list: 'flex items-start gap-3',
  card: 'flex w-full items-start gap-3 rounded-lg border border-base bg-surface-2 px-4 py-3 has-data-[state=checked]:border-selected has-data-[state=checked]:bg-surface-3'
}

/**
 * RadioGroup — Single-choice item; card variant hosts rich content (ModelRow).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=212-388
 * Styles live in ui/radio-group.tsx. Inside a RadioGroupRoot the root's value decides `selected`;
 * on its own the item gets a one-item root and `selected` is its starting value.
 */
export function RadioGroup({ className, children, value, ...rest }: RadioGroupProps) {
  const { variant, selected, showDescription, label, description, ...props } = {
    ...RADIO_GROUP_DEFAULTS,
    ...rest
  }
  const inGroup = useInRadioGroup()
  const itemValue = value ?? label

  const item = (
    <label
      data-ds="RadioGroup"
      data-variant={variant}
      className={cn(
        LAYOUT[variant],
        'has-disabled:cursor-not-allowed has-disabled:opacity-50',
        className
      )}
    >
      {/* The row dims as a whole when disabled, as in Figma. */}
      <RadioGroupItem value={itemValue} className="disabled:opacity-100" {...props} />
      {children ?? (
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="type-body-sm-medium text-foreground">{label}</span>
          {showDescription && (
            <span className="type-caption-xs-regular text-tertiary">{description}</span>
          )}
        </span>
      )}
    </label>
  )

  if (inGroup) return item
  return (
    <UiRadioGroup
      {...(selected && { defaultValue: itemValue })}
      className={variant === 'list' ? 'inline-grid w-auto' : undefined}
    >
      {item}
    </UiRadioGroup>
  )
}
