import { useId, type ComponentProps } from 'react'
import { cn } from '@renderer/lib/utils'
import { Switch as UiSwitch } from '@renderer/ui/switch'
import { SWITCH_DEFAULTS, type SwitchContractProps } from './Switch.types'

export interface SwitchProps
  extends SwitchContractProps,
    Omit<ComponentProps<typeof UiSwitch>, keyof SwitchContractProps | 'defaultChecked'> {}

/**
 * Switch — Binary settings (telemetry consent, AI on/off).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=212-339
 * Styles live in ui/switch.tsx (base → default). Pass onCheckedChange to control `checked`;
 * without it, `checked` is only the starting value. Without a visible label, pass aria-label.
 */
export function Switch({ className, id, onCheckedChange, ...rest }: SwitchProps) {
  const { size, checked, showLabel, label, ...props } = { ...SWITCH_DEFAULTS, ...rest }
  const fallbackId = useId()
  const switchId = id ?? fallbackId

  return (
    <div
      data-ds="Switch"
      className={cn('inline-flex items-center gap-3 has-disabled:opacity-50', className)}
    >
      {/* The row dims as a whole when disabled, as in Figma. */}
      <UiSwitch
        id={switchId}
        size={size === 'base' ? 'default' : 'sm'}
        {...(onCheckedChange ? { checked, onCheckedChange } : { defaultChecked: checked })}
        className="data-disabled:opacity-100"
        {...props}
      />
      {showLabel && (
        <label htmlFor={switchId} className="type-body-sm-regular text-foreground">
          {label}
        </label>
      )}
    </div>
  )
}
