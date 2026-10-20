import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@renderer/lib/utils"

// Figma Button 211:2091. variant="default" ↔ primary, size="default" ↔ base.
// Heights come from padding + the 20px (16px at xs) line, so outline's 1px border adds 2px as in Figma.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg whitespace-nowrap transition-colors outline-none select-none focus-visible:focus-ring disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-on-primary hover:bg-primary-hover aria-expanded:bg-primary-hover",
        secondary:
          "bg-surface-3 text-foreground hover:bg-surface-3-hover aria-expanded:bg-surface-3-hover",
        outline:
          "border border-base text-foreground hover:bg-surface-2-hover aria-expanded:bg-surface-2-hover",
        ghost: "text-foreground hover:bg-surface-2-hover aria-expanded:bg-surface-2-hover",
        destructive: "bg-error text-on-error hover:bg-error-hover aria-expanded:bg-error-hover",
        link: "text-brand hover:text-brand-hover",
      },
      size: {
        xs: "gap-1 px-2 py-1 type-label-xs-medium [&_svg:not([class*='size-'])]:size-4",
        sm: "gap-1.5 px-3 py-1.5 type-body-sm-medium [&_svg:not([class*='size-'])]:size-4",
        default: "gap-2 px-4 py-2 type-body-sm-medium [&_svg:not([class*='size-'])]:size-5",
        lg: "gap-2 px-6 py-2.5 type-body-sm-medium [&_svg:not([class*='size-'])]:size-5",
        icon: "p-2 [&_svg:not([class*='size-'])]:size-5",
        "icon-xs": "p-1 [&_svg:not([class*='size-'])]:size-4",
        "icon-sm": "p-2 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "p-2.5 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    compoundVariants: [{ variant: "link", className: "px-0" }],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
