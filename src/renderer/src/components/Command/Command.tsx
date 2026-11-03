import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { COMMAND_CONTRACT, COMMAND_DEFAULTS, type CommandContractProps } from './Command.types'
import { commandVariants } from './Command.variants'

export interface CommandProps extends CommandContractProps {
  className?: string
}

/**
 * Command — Searchable list with keyboard nav: inline = tag combobox, palette = ⌘K.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=213-474
 * Today: ui/command.tsx (cmdk)
 */
export function Command({ className, ...rest }: CommandProps) {
  const props = { ...COMMAND_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Command" on the root element.
  return (
    <ScaffoldStub
      contract={COMMAND_CONTRACT}
      props={props}
      className={cn(commandVariants({ variant: props.variant, state: props.state }), className)}
    />
  )
}
