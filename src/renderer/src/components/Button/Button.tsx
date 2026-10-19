import type { ComponentProps, ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Spinner } from '@renderer/components/Spinner'
import { Button as UiButton } from '@renderer/ui/button'
import { BUTTON_DEFAULTS, type ButtonContractProps } from './Button.types'

export interface ButtonProps
  extends ButtonContractProps,
    Omit<ComponentProps<'button'>, keyof ButtonContractProps> {
  /** Replaces `label` when the content is more than text. */
  children?: ReactNode
}

const VARIANT = {
  primary: 'default',
  secondary: 'secondary',
  outline: 'outline',
  ghost: 'ghost',
  destructive: 'destructive',
  link: 'link'
} as const

const SIZE = { xs: 'xs', sm: 'sm', base: 'default', lg: 'lg', icon: 'icon' } as const

/**
 * Button — Every clickable action. loading shows the Spinner; disabled = 50% opacity; focus = 2px border/focus ring outside.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=211-2091
 * Styles live in ui/button.tsx; this maps the Figma props onto it (primary → default, base → default).
 * size=icon shows `iconStart` alone, so pass an aria-label.
 */
export function Button({ children, ...rest }: ButtonProps) {
  const {
    variant,
    size,
    disabled,
    showIconStart,
    showIconEnd,
    loading,
    label,
    iconStart,
    iconEnd,
    ...props
  } = { ...BUTTON_DEFAULTS, ...rest }
  const spinner = <Spinner size={size === 'xs' || size === 'sm' ? 'sm' : 'base'} />

  return (
    <UiButton
      data-ds="Button"
      variant={VARIANT[variant]}
      size={SIZE[size]}
      disabled={disabled}
      aria-busy={loading || undefined}
      {...props}
    >
      {size === 'icon' ? (
        loading ? (
          spinner
        ) : (
          <HugeiconsIcon icon={iconStart} strokeWidth={1.5} />
        )
      ) : (
        <>
          {loading ? spinner : showIconStart && <HugeiconsIcon icon={iconStart} strokeWidth={1.5} />}
          {children ?? label}
          {showIconEnd && <HugeiconsIcon icon={iconEnd} strokeWidth={1.5} />}
        </>
      )}
    </UiButton>
  )
}
