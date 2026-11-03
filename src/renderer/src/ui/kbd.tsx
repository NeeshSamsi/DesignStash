import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@renderer/lib/utils"

// Figma KeyboardShortcut 211:41. variant="default" ↔ boxed (inputs, palettes); plain for menus and tooltips.
const kbdVariants = cva(
  "pointer-events-none inline-flex w-fit items-center justify-center gap-1 font-sans type-caption-xs-regular whitespace-nowrap select-none [&_svg:not([class*='size-'])]:size-icon-2xs",
  {
    variants: {
      variant: {
        default: "rounded-sm border border-base bg-surface-3 px-1.5 py-0.5 text-muted-foreground",
        plain: "text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function Kbd({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"kbd"> & VariantProps<typeof kbdVariants>) {
  return (
    <kbd
      data-slot="kbd"
      data-variant={variant}
      className={cn(kbdVariants({ variant }), className)}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup, kbdVariants }
