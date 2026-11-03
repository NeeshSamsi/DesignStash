import { useContext } from 'react'
import { cn } from '@renderer/lib/utils'
import {
  TabsIndicator,
  TabsTrigger as UiTabsTrigger,
  tabsTriggerVariants as uiTriggerVariants
} from '@renderer/ui/tabs'
import { TabsLiveContext } from '../Tabs/Tabs'
import { TABS_TRIGGER_DEFAULTS, type TabsTriggerContractProps } from './TabsTrigger.types'
import { tabsTriggerVariants } from './TabsTrigger.variants'

export interface TabsTriggerProps extends TabsTriggerContractProps {
  /** Tab value inside Tabs. Defaults to the label. */
  value?: string
  className?: string
}

const UI_VARIANT = { line: 'line', pill: 'default' } as const

/**
 * TabsTrigger — Building block for Tabs.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=213-573
 * Adapter over TabsTrigger in ui/tabs.tsx. Inside Tabs, Radix sets `active` and the list sets
 * the variant; on its own it renders in place from `variant` and `active`.
 */
export function TabsTrigger({ className, value, ...rest }: TabsTriggerProps) {
  const props = { ...TABS_TRIGGER_DEFAULTS, ...rest }
  const classes = cn(tabsTriggerVariants({ variant: props.variant }), className)

  if (useContext(TabsLiveContext)) {
    return (
      <UiTabsTrigger data-ds="TabsTrigger" value={value ?? props.label} className={classes}>
        {props.label}
      </UiTabsTrigger>
    )
  }

  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.active}
      data-ds="TabsTrigger"
      data-active={props.active ? '' : undefined}
      className={cn(uiTriggerVariants({ variant: UI_VARIANT[props.variant] }), classes)}
    >
      {props.label}
      {props.variant === 'line' && <TabsIndicator />}
    </button>
  )
}
