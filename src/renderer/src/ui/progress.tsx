import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@renderer/lib/utils"

const progressVariants = cva(
  "relative flex w-full overflow-hidden rounded-full bg-surface-4",
  {
    variants: {
      size: {
        sm: "h-1",
        default: "h-2",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

const progressIndicatorVariants = cva("h-full rounded-full transition-all", {
  variants: {
    state: {
      progress: "w-full bg-primary",
      complete: "w-full bg-success",
      error: "w-full bg-error",
      // Figma draws a third-width bar a third of the way in; it pulses while we wait.
      indeterminate: "w-1/3 translate-x-full animate-pulse bg-primary",
    },
  },
  defaultVariants: {
    state: "progress",
  },
})

type ProgressState = NonNullable<
  VariantProps<typeof progressIndicatorVariants>["state"]
>

function Progress({
  className,
  value,
  size,
  state = "progress",
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> &
  VariantProps<typeof progressVariants> & { state?: ProgressState }) {
  const percent = state === "complete" ? 100 : Math.min(100, Math.max(0, value ?? 0))
  const determinate = state !== "indeterminate"
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={determinate ? percent : null}
      className={cn(progressVariants({ size }), className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={progressIndicatorVariants({ state })}
        style={determinate ? { transform: `translateX(-${100 - percent}%)` } : undefined}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress, progressVariants, progressIndicatorVariants, type ProgressState }
