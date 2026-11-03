import { ICON_STROKE } from "@renderer/design-system/icon"
import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import { HugeiconsIcon } from "@hugeicons/react"
import { MinusSignIcon, Tick02Icon } from "@hugeicons/core-free-icons"

import { cn } from "@renderer/lib/utils"

// Figma Checkbox 212:302: 16px box, 4px radius; checked and indeterminate fill with background/primary.
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "group/checkbox peer relative flex size-4 shrink-0 items-center justify-center rounded-sm border border-strong bg-surface-2 transition-colors outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-error data-checked:border-primary data-checked:bg-primary data-checked:text-on-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-on-primary",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-4"
      >
        <HugeiconsIcon
          icon={Tick02Icon}
          strokeWidth={ICON_STROKE}
          className="group-data-[state=indeterminate]/checkbox:hidden"
        />
        <HugeiconsIcon
          icon={MinusSignIcon}
          strokeWidth={ICON_STROKE}
          className="hidden group-data-[state=indeterminate]/checkbox:block"
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
