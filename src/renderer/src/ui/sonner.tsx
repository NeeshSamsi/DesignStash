import { Toaster as Sonner, type ToasterProps } from "sonner"

import { dockBottom } from "@renderer/lib/dock"
import { useDockStore } from "@renderer/stores/dockStore"

/**
 * Bottom-right, 360 wide (`w-toast`). Toasts render through `toast.custom` with the
 * Toast component (components/Toast), so Sonner supplies only positioning and motion.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  // Toasts sit above the page's pinned action bar, like the copy widget.
  const barTop = useDockStore((s) => s.barTop)
  // App is hard-pinned to dark (`.dark` on <html>); no next-themes provider.
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      className="toaster group"
      offset={{ bottom: dockBottom(barTop, window.innerHeight) }}
      style={{ "--width": "var(--width-toast)" } as React.CSSProperties}
      {...props}
    />
  )
}

export { Toaster }
