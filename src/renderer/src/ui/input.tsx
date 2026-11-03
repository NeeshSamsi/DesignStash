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

/**
 * The Input box holding an icon, a bare InputGroupInput and trailing controls (search field). The whole
 * box is the field: a press on its border, padding, icon or hint focuses the input, with the caret at the
 * start when pressed left of the text and at the end otherwise. Its buttons keep their own presses.
 */
function InputGroup({ className, onMouseDown, ...props }: React.ComponentProps<"div">) {
  const focusInput = (event: React.MouseEvent<HTMLDivElement>) => {
    onMouseDown?.(event)
    const target = event.target as Element
    if (event.defaultPrevented || event.button !== 0 || target.closest("input, button, a")) return
    const input = event.currentTarget.querySelector<HTMLInputElement>(
      '[data-slot="input-group-control"]'
    )
    if (!input || input.disabled) return
    // Keeps the press from moving focus to the box or starting a text selection on it.
    event.preventDefault()
    input.focus()
    const at = event.clientX < input.getBoundingClientRect().left ? 0 : input.value.length
    input.setSelectionRange(at, at)
  }
  return (
    <div
      data-slot="input-group"
      onMouseDown={focusInput}
      className={cn(
        inputBox,
        "flex cursor-text items-center gap-2 px-3 py-2 has-focus-visible:focus-ring has-aria-invalid:border-error has-disabled:opacity-50 [&_svg]:shrink-0",
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
        "min-w-0 flex-1 bg-transparent type-body-base-regular text-foreground outline-none placeholder:text-placeholder disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  )
}

export { Input, InputGroup, InputGroupInput, inputVariants }
