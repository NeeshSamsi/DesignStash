import { useId, type ComponentProps, type ReactNode } from 'react'
import { Input } from '@renderer/components/Input'
import {
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Field as UiField
} from '@renderer/ui/field'
import { FIELD_DEFAULTS, type FieldContractProps } from './Field.types'

export interface FieldProps
  extends FieldContractProps, Omit<ComponentProps<'div'>, keyof FieldContractProps | 'children'> {
  /** The control (Figma's control slot). Defaults to an Input; give yours `id={htmlFor}`. */
  children?: ReactNode
  /** id of the control the label points at. */
  htmlFor?: string
}

/**
 * Field — Label + control + description + error, so validation always has words.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=212-273
 * Styles live in ui/field.tsx. The error shows only while invalid.
 */
export function Field({ children, htmlFor, ...rest }: FieldProps) {
  const {
    orientation,
    invalid,
    disabled,
    required,
    showDescription,
    label,
    description,
    error,
    ...props
  } = { ...FIELD_DEFAULTS, ...rest }
  const fallbackId = useId()
  const controlId = htmlFor ?? fallbackId

  const labelRow = (
    <FieldLabel htmlFor={controlId}>
      {label}
      {required && (
        <span aria-hidden className="text-error">
          *
        </span>
      )}
    </FieldLabel>
  )
  const control = children ?? (
    <Input id={controlId} disabled={disabled} aria-invalid={invalid || undefined} />
  )
  const descriptionText = showDescription && <FieldDescription>{description}</FieldDescription>
  const errorText = invalid && <FieldError>{error}</FieldError>

  return (
    <UiField
      data-ds="Field"
      orientation={orientation}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      {...props}
    >
      {orientation === 'horizontal' ? (
        <>
          <FieldContent>
            {labelRow}
            {descriptionText}
          </FieldContent>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {control}
            {errorText}
          </div>
        </>
      ) : (
        <>
          {labelRow}
          {control}
          {descriptionText}
          {errorText}
        </>
      )}
    </UiField>
  )
}
