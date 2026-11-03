import * as React from "react"

import { cn } from "@renderer/lib/utils"

// Figma Textarea 212:205: the Input box at body size, 80px tall at rest, growing with its content.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-lg border border-input bg-surface-2 px-3 py-2 type-body-sm-regular text-foreground transition-colors outline-none placeholder:text-placeholder focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-error",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
