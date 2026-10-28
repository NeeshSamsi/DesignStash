import type { ReactNode } from 'react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { Banner } from '@renderer/components/Banner'
import { Field } from '@renderer/components/Field'
import { DialogFrame, DialogHeading } from '@renderer/lib/dialog-shell'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/Button'
import { Spinner } from '@renderer/components/Spinner'
import { FORM_DIALOG_DEFAULTS, type FormDialogContractProps } from './FormDialog.types'
import { formDialogVariants } from './FormDialog.variants'

export interface FormDialogProps extends FormDialogContractProps {
  /** Live dialog when given; without it the dialog renders in place (catalog). */
  open?: boolean
  /** The Field(s). Disable them yourself while `submitting`. */
  children?: ReactNode
  onSubmit?: () => void
  onCancel?: () => void
  submitLabel?: string
  /** Shown beside the spinner while `submitting`. */
  submittingLabel?: string
  /** Banner for server errors (`state="error"`). */
  errorTitle?: string
  errorMessage?: string
  className?: string
}

/**
 * FormDialog — Small dialog with Field(s) and a submit; validation inline, server errors in a Banner.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=216-1456
 * Enter submits (the fields sit in a form); Esc and ✕ cancel. The catalog sample Name field
 * appears only in the static rendering.
 */
export function FormDialog({
  className,
  open,
  children,
  onSubmit,
  onCancel,
  submitLabel = 'Create',
  submittingLabel = 'Creating…',
  errorTitle = 'Couldn’t create the category',
  errorMessage = 'Try again in a moment.',
  ...rest
}: FormDialogProps) {
  const props = { ...FORM_DIALOG_DEFAULTS, ...rest }
  const isStatic = open === undefined
  const submitting = props.state === 'submitting'
  const sample = (
    <Field
      label="Name"
      description="Outside the built-in taxonomy, so AI tagging won’t suggest it."
      error="A category with this name already exists."
      invalid={props.state === 'invalid'}
      disabled={submitting}
    />
  )

  return (
    <DialogFrame
      open={open}
      dataDs="FormDialog"
      className={cn(formDialogVariants({ state: props.state }), className)}
      onDismiss={onCancel}
      showCloseButton
    >
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (!submitting) onSubmit?.()
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <DialogHeading title={props.title} description={props.description} />
          {isStatic && (
            <Button
              variant="ghost"
              size="icon"
              type="button"
              aria-label="Close"
              onClick={onCancel}
              iconStart={Cancel01Icon}
            />
          )}
        </div>
        {children ?? (isStatic ? sample : null)}
        {props.state === 'error' && (
          <Banner
            tone="error"
            title={errorTitle}
            message={errorMessage}
            action
            actionLabel="Retry"
            {...(onSubmit ? { onAction: onSubmit } : {})}
            dismissible={false}
          />
        )}
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" type="submit" disabled={submitting} aria-busy={submitting || undefined}>
            {submitting ? (
              <>
                <Spinner size="sm" aria-hidden />
                {submittingLabel}
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      </form>
    </DialogFrame>
  )
}
