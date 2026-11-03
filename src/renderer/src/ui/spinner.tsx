import { cva, type VariantProps } from "class-variance-authority"
import { HugeiconsIcon, type HugeiconsIconProps } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

import { cn } from "@renderer/lib/utils"

const spinnerVariants = cva("shrink-0 animate-spin text-tertiary", {
  variants: {
    size: {
      sm: "size-4",
      default: "size-5",
      lg: "size-6",
    },
  },
  defaultVariants: {
    size: "default",
  },
})

/** Short waits only (Button loading, inline lookups). Page loads use Skeleton. */
function Spinner({
  className,
  size,
  ...props
}: Omit<HugeiconsIconProps, "icon"> & VariantProps<typeof spinnerVariants>) {
  return (
    <HugeiconsIcon
      data-slot="spinner"
      icon={Loading03Icon}
      role="status"
      aria-label="Loading"
      className={cn(spinnerVariants({ size }), className)}
      {...props}
    />
  )
}

export { Spinner, spinnerVariants }
