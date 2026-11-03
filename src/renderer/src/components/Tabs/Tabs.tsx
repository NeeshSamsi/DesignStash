import { createContext, type ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import { Tabs as UiTabs, TabsList } from '@renderer/ui/tabs'
import { TABS_DEFAULTS, type TabsContractProps } from './Tabs.types'
import { tabsVariants } from './Tabs.variants'

/** True inside Tabs, where TabsTrigger is a live Radix trigger. */
export const TabsLiveContext = createContext(false)

export interface TabsProps extends TabsContractProps {
  /** TabsTrigger rows. */
  children?: ReactNode
  /** TabsContent panels from ui/tabs.tsx, rendered under the list. */
  panels?: ReactNode
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  className?: string
}

const UI_VARIANT = { line: 'line', pill: 'default' } as const

/**
 * Tabs — Settings section switcher. (Used by no flow screen; Settings now uses a section list.)
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=213-608
 * Adapter over ui/tabs.tsx (Figma `pill` → shadcn `default`).
 */
export function Tabs({
  className,
  children,
  panels,
  value,
  defaultValue,
  onValueChange,
  ...rest
}: TabsProps) {
  const props = { ...TABS_DEFAULTS, ...rest }
  return (
    <UiTabs
      data-ds="Tabs"
      data-variant={props.variant}
      {...(value !== undefined ? { value } : {})}
      {...(defaultValue !== undefined ? { defaultValue } : {})}
      {...(onValueChange ? { onValueChange } : {})}
      className={cn(tabsVariants({ variant: props.variant }), className)}
    >
      <TabsList variant={UI_VARIANT[props.variant]}>
        <TabsLiveContext.Provider value>{children}</TabsLiveContext.Provider>
      </TabsList>
      {panels}
    </UiTabs>
  )
}
