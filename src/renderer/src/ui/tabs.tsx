import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@renderer/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

type TabsVariant = "default" | "line"

/** Lets triggers style themselves for their list's variant. */
const TabsVariantContext = React.createContext<TabsVariant>("default")

const tabsListVariants = cva("inline-flex w-fit", {
  variants: {
    variant: {
      // Figma `pill`.
      default: "items-center gap-1 rounded-lg bg-surface-2 p-1",
      line: "items-end gap-2 border-b border-subtle",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  const resolved = variant ?? "default"
  return (
    <TabsVariantContext.Provider value={resolved}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={resolved}
        className={cn(tabsListVariants({ variant: resolved }), className)}
        {...props}
      />
    </TabsVariantContext.Provider>
  )
}

const tabsTriggerVariants = cva(
  "group/tabs-trigger relative inline-flex items-center justify-center whitespace-nowrap type-body-sm-medium text-tertiary transition-colors outline-none hover:text-foreground focus-visible:focus-ring disabled:pointer-events-none disabled:opacity-50 data-active:text-foreground",
  {
    variants: {
      variant: {
        default:
          "rounded-md px-3 py-1.5 hover:bg-surface-2-hover data-active:bg-surface-3",
        line: "flex-col gap-2 px-3 pt-2",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

/** The line variant's 2px underline, shown on the active trigger. */
function TabsIndicator() {
  return (
    <span
      aria-hidden
      data-slot="tabs-indicator"
      className="h-0.5 self-stretch bg-transparent group-data-active/tabs-trigger:bg-primary"
    />
  )
}

function TabsTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.useContext(TabsVariantContext)
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props}
    >
      {children}
      {variant === "line" && <TabsIndicator />}
    </TabsPrimitive.Trigger>
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TabsIndicator,
  tabsListVariants,
  tabsTriggerVariants,
}
