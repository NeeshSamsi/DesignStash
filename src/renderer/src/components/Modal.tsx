import { Dialog, DialogContent, DialogTitle } from '../ui/dialog'
import { cn } from '../lib/utils'

interface ModalProps {
  children: React.ReactNode
  onClose?: () => void
  blocking?: boolean
  className?: string
  /** Show the built-in shadcn close button. Set false when the consumer renders its own. */
  showClose?: boolean
  /**
   * Accessible name for the dialog (visually hidden). Consumers render their own
   * visible heading inside `children`; this satisfies the Radix a11y requirement.
   */
  label?: string
}

/**
 * Thin wrapper over the shadcn Dialog primitive. Renders content padding-free so
 * existing consumers keep control of their own internal layout. Esc / outside-click
 * close unless `blocking`.
 */
export function Modal({
  children,
  onClose,
  blocking = false,
  className,
  showClose = true,
  label = 'Dialog',
}: ModalProps) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !blocking) onClose?.()
      }}
    >
      <DialogContent
        showCloseButton={showClose && !blocking}
        onEscapeKeyDown={(e) => {
          if (blocking) e.preventDefault()
        }}
        onInteractOutside={(e) => {
          if (blocking) e.preventDefault()
        }}
        className={cn('gap-0 p-0 sm:max-w-lg', className)}
      >
        <DialogTitle className="sr-only">{label}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  )
}
