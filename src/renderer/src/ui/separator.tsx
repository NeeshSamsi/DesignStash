import * as React from "react"
import { Separator as SeparatorPrimitive } from "radix-ui"

import { cn } from "@renderer/lib/utils"

// A 1px line in border/subtle (drawn as a border, since it is a border token). It has no
// design-system component: Popover uses it between its regions.
function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 border-subtle data-horizontal:w-full data-horizontal:border-t data-vertical:self-stretch data-vertical:border-l",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
