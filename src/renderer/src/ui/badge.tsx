import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@renderer/lib/utils"

// Figma Badge 211:78. variant="default" ↔ primary. Status variants use weak fills + coloured text;
// count is the quiet tally pill. Only outline has a border (so it is 2px taller, as in Figma).
const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full px-2 py-0.5 type-label-xs-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring [&>svg]:pointer-events-none [&>svg]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-on-primary [a]:hover:bg-primary-hover",
        secondary: "bg-surface-3 text-muted-foreground [a]:hover:bg-surface-3-hover",
        outline: "border border-base text-foreground [a]:hover:bg-surface-2-hover",
        destructive: "bg-error-weak text-error",
        success: "bg-success-weak text-success",
        warning: "bg-warning-weak text-warning",
        info: "bg-informational-weak text-informational",
        count: "bg-surface-3 px-1.5 text-tertiary",
        ghost: "text-foreground hover:bg-surface-2-hover",
        link: "text-brand underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
