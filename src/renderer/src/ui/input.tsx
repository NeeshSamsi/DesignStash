import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@renderer/lib/utils"

// Figma Input 212:190. Focus draws the shared focus-ring utility (2px, offset 2px) around the field,
// so nothing in the box shifts.
const inputBox =
  "w-full min-w-0 rounded-lg border border-input bg-surface-2 text-foreground transition-colors outline-none aria-invalid:border-error"

const inputVariants = cva(
  cn(
    inputBox,
    "placeholder:text-placeholder focus-visible:focus-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 file:inline-flex file:border-0 file:bg-transparent file:type-body-sm-medium file:text-foreground"
  ),
  {
    variants: {
      variant: {
        default: "px-3 py-2 type-body-sm-regular",
        // The Detail title field: bordered at rest like Textarea, at title size; focus sits inside.
        "inline-title": "px-3 py-1 type-display-2xl-medium focus-visible:-outline-offset-2",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function Input({
  className,
  type,
  variant = "default",
  ...props
}: React.ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      data-variant={variant}
      className={cn(inputVariants({ variant }), className)}
      {...props}
    />
  )
}

/** The Input box holding an icon, a bare InputGroupInput and trailing controls (search field). */
function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      className={cn(
        inputBox,
        "flex items-center gap-2 px-3 py-2 has-focus-visible:focus-ring has-aria-invalid:border-error has-disabled:opacity-50 [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function InputGroupInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input-group-control"
      className={cn(
        "min-w-0 flex-1 bg-transparent type-body-base-light text-foreground outline-none placeholder:text-placeholder disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  )
}

export { Input, InputGroup, InputGroupInput, inputVariants }
