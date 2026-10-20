import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Bottom-right, 360 wide (`w-toast`). Toasts render through `toast.custom` with the
 * Toast component (components/Toast), so Sonner supplies only positioning and motion.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  // App is hard-pinned to dark (`.dark` on <html>); no next-themes provider.
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      className="toaster group"
      style={{ "--width": "var(--width-toast)" } as React.CSSProperties}
      {...props}
    />
  )
}

export { Toaster }
