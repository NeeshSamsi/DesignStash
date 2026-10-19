import { cn } from '@renderer/lib/utils'
import { CENTERED_LAYOUT_DEFAULTS, type CenteredLayoutContractProps } from './CenteredLayout.types'
import { centeredLayoutContentVariants, centeredLayoutVariants } from './CenteredLayout.variants'

export interface CenteredLayoutProps extends CenteredLayoutContractProps {
  className?: string
}

/**
 * CenteredLayout — Full-window layout without the sidebar (onboarding, boot, fatal errors): centred 560 content.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=216-1679
 * `content` is the screen. Dialogs belong in their own layer, not in this slot.
 */
export function CenteredLayout({ className, ...rest }: CenteredLayoutProps) {
  const props = { ...CENTERED_LAYOUT_DEFAULTS, ...rest }
  return (
    <div
      data-ds="CenteredLayout"
      data-variant={props.variant}
      className={cn(centeredLayoutVariants({ variant: props.variant }), className)}
    >
      <div className="h-11 shrink-0" />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto">
        <div className={centeredLayoutContentVariants({ variant: props.variant })}>
          {props.content}
        </div>
      </div>
    </div>
  )
}
