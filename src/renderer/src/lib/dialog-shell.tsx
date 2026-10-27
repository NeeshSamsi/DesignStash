import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle
} from '@renderer/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  dialogDescriptionClass,
  dialogPanelClass,
  dialogTitleClass
} from '@renderer/ui/dialog'

/**
 * How a design-system dialog renders: `static` is the in-place panel (catalog, Figma parity),
 * `dialog` and `alert` are the live Radix overlays. Alert dialogs focus Cancel first.
 */
type Kind = 'static' | 'dialog' | 'alert'

const KindContext = createContext<Kind>('static')

/** Menus, pickers and popovers that open over a dialog. The card grid's list is not one. */
const NESTED_LAYER =
  '[role="menu"], [role="listbox"]:not([data-slot="mockup-cards"]), [data-slot="popover-content"], [data-slot="select-content"]'

/**
 * Whether a menu, picker or popover was open when the latest mouse press began. Radix closes such a
 * layer on pointerdown, which removes it before the dialog under it judges the same press, so the
 * dialog sees an outside press and closes as well. This reads the state before Radix does: the
 * capture listener runs first on the document.
 */
function useNestedLayerPress(active: boolean) {
  const nestedOpen = useRef(false)
  useEffect(() => {
    if (!active) return
    const note = () => {
      nestedOpen.current = document.querySelector(NESTED_LAYER) !== null
    }
    document.addEventListener('pointerdown', note, true)
    return () => document.removeEventListener('pointerdown', note, true)
  }, [active])
  return (e: Event) =>
    nestedOpen.current &&
    (e as CustomEvent<{ originalEvent?: Event }>).detail?.originalEvent?.type === 'pointerdown'
}

interface DialogFrameProps {
  /** Live overlay when `open` is given; otherwise the static panel. */
  open?: boolean | undefined
  alert?: boolean
  dataDs: string
  className?: string
  /** Called when Radix asks to close (Esc, outside press, close button). */
  onDismiss?: (() => void) | undefined
  /** Blocks Esc, outside presses and the built-in close button. */
  blocking?: boolean
  /** The built-in ✕ (Dialog only). */
  showCloseButton?: boolean
  children: ReactNode
}

export function DialogFrame({
  open,
  alert = false,
  dataDs,
  className,
  onDismiss,
  blocking = false,
  showCloseButton = false,
  children
}: DialogFrameProps) {
  const pressClosedNested = useNestedLayerPress(open === true)
  if (open === undefined) {
    return (
      <KindContext.Provider value="static">
        <div data-ds={dataDs} className={cn(dialogPanelClass, className)}>
          {children}
        </div>
      </KindContext.Provider>
    )
  }

  const onOpenChange = (next: boolean) => {
    if (!next && !blocking) onDismiss?.()
  }
  // An ask raised over a dialog sits outside its layer. Pressing it (Keep editing, Cancel) must not
  // read as an outside press on the dialog beneath, or the ask is raised again.
  const overAsk = (e: Event) => {
    const target = (e as CustomEvent<{ originalEvent?: Event }>).detail?.originalEvent?.target
    return target instanceof Element && target.closest('[role="alertdialog"]') !== null
  }
  const guard = blocking
    ? {
        onEscapeKeyDown: (e: Event) => e.preventDefault(),
        onInteractOutside: (e: Event) => e.preventDefault()
      }
    : {}

  if (alert) {
    return (
      <KindContext.Provider value="alert">
        <AlertDialog open={open} onOpenChange={onOpenChange}>
          <AlertDialogContent data-ds={dataDs} className={className} {...guard}>
            {children}
          </AlertDialogContent>
        </AlertDialog>
      </KindContext.Provider>
    )
  }

  return (
    <KindContext.Provider value="dialog">
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          data-ds={dataDs}
          showCloseButton={showCloseButton && !blocking}
          className={className}
          onInteractOutside={(e) => {
            if (blocking || overAsk(e) || pressClosedNested(e)) e.preventDefault()
          }}
          {...(blocking ? { onEscapeKeyDown: (e: Event) => e.preventDefault() } : {})}
        >
          {children}
        </DialogContent>
      </Dialog>
    </KindContext.Provider>
  )
}

interface DialogHeadingProps {
  title: string
  description?: string | undefined
}

/** Title and description in the right element for the surrounding frame (Radix a11y names when live). */
export function DialogHeading({ title, description }: DialogHeadingProps) {
  const kind = useContext(KindContext)
  const Title = kind === 'alert' ? AlertDialogTitle : kind === 'dialog' ? DialogTitle : null
  const Description =
    kind === 'alert' ? AlertDialogDescription : kind === 'dialog' ? DialogDescription : null
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      {Title ? <Title>{title}</Title> : <p className={dialogTitleClass}>{title}</p>}
      {description !== undefined &&
        (Description ? (
          <Description>{description}</Description>
        ) : (
          <p className={dialogDescriptionClass}>{description}</p>
        ))}
    </div>
  )
}
