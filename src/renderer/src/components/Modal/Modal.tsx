import { ICON_STROKE } from '@renderer/design-system/icon'
import type { ReactNode } from 'react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ActionBar } from '@renderer/components/ActionBar'
import { DialogFrame, DialogHeading } from '@renderer/lib/dialog-shell'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/ui/button'
import { MODAL_DEFAULTS, type ModalContractProps } from './Modal.types'
import { modalVariants } from './Modal.variants'

export interface ModalProps extends ModalContractProps {
  /** Live overlay when given; without it the modal renders in place (catalog). */
  open?: boolean
  onClose?: () => void
  /** No close button, Esc and outside presses ignored (e.g. a stash check that must finish). */
  blocking?: boolean
  /** Footer content, normally an <ActionBar />. Shown when `footer` is on. */
  footerContent?: ReactNode
  className?: string
}

/**
 * Modal — Base content dialog: header, scrolling body slot, ActionBar footer.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=216-780
 * Live (`open`) it is the Radix Dialog from ui/dialog.tsx. The catalog placeholder body and
 * sample footer appear only in the static rendering, never in a live modal.
 */
export function Modal({
  className,
  open,
  onClose,
  blocking = false,
  body,
  footerContent,
  ...rest
}: ModalProps) {
  const props = { ...MODAL_DEFAULTS, ...rest }
  const isStatic = open === undefined
  const closable = props.closable && !blocking
  const footer = footerContent ?? (isStatic ? <ActionBar startLabel="Open in Photoshop" /> : null)
  return (
    <DialogFrame
      open={open}
      dataDs="Modal"
      className={cn('flex max-h-viewport flex-col', modalVariants({ size: props.size }), className)}
      onDismiss={onClose}
      blocking={blocking}
      showCloseButton={closable}
    >
      <div className="flex items-start justify-between gap-4">
        <DialogHeading
          title={props.title}
          description={props.showDescription ? props.description : undefined}
        />
        {isStatic && closable && (
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={ICON_STROKE} />
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {body ??
          (isStatic && (
            <div className="flex h-16 flex-col items-center justify-center rounded-lg border border-dashed border-subtle px-12 py-6">
              <p className="type-caption-xs-regular text-tertiary">Swap in content</p>
            </div>
          ))}
      </div>
      {props.footer && footer}
    </DialogFrame>
  )
}
