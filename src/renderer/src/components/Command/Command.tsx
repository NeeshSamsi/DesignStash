import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import {
  Command as UiCommand,
  CommandEmpty,
  CommandInput,
  CommandList,
  CommandLoading
} from '@renderer/ui/command'
import { COMMAND_DEFAULTS, type CommandContractProps } from './Command.types'
import { commandVariants } from './Command.variants'

export interface CommandProps extends CommandContractProps {
  /** Results: the CommandGroup / CommandItem rows below. Shown in `results`; `items` works too. */
  children?: ReactNode
  /** Typed text (controlled). `query` is the placeholder. */
  value?: string
  onValueChange?: (value: string) => void
  /** The highlighted row's value (controlled), for a list whose keys come from elsewhere. */
  active?: string
  onActiveChange?: (value: string) => void
  /** Palette only: shortcut hint at the end of the field (KeyboardShortcut). */
  shortcut?: ReactNode
  emptyMessage?: string
  loadingMessage?: string
  /** Let cmdk filter the rows itself (off when the caller filters, e.g. tag search). */
  shouldFilter?: boolean
  label?: string
  className?: string
}

const UI_VARIANT = { inline: 'default', palette: 'palette', list: 'default' } as const

/** The rows the results take. */
export { CommandGroup, CommandItem, CommandShortcut } from '@renderer/ui/command'

/**
 * Command — Searchable list with keyboard nav: inline = tag combobox, palette = ⌘K.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=213-474
 * Adapter over ui/command.tsx (cmdk). `state` picks what the list shows.
 */
export function Command({
  className,
  children,
  value,
  onValueChange,
  active,
  onActiveChange,
  shortcut,
  emptyMessage = 'No matching tags',
  loadingMessage = 'Searching…',
  shouldFilter,
  label,
  ...rest
}: CommandProps) {
  const props = { ...COMMAND_DEFAULTS, ...rest }
  // The list alone sits in another panel, which pads it, and takes its keys from elsewhere.
  const list = props.variant === 'list'
  return (
    <UiCommand
      data-ds="Command"
      data-state={props.state}
      variant={UI_VARIANT[props.variant]}
      {...(shouldFilter !== undefined ? { shouldFilter } : {})}
      {...(active !== undefined ? { value: active } : {})}
      {...(onActiveChange ? { onValueChange: onActiveChange } : {})}
      {...(list ? (label !== undefined ? { label } : {}) : { label: label ?? props.query })}
      className={cn(commandVariants({ variant: props.variant, state: props.state }), className)}
    >
      {!list && (
        <CommandInput
          placeholder={props.query}
          {...(value !== undefined ? { value } : {})}
          {...(onValueChange ? { onValueChange } : {})}
        >
          {props.variant === 'palette' && shortcut}
        </CommandInput>
      )}
      <CommandList {...(list ? { className: 'p-0' } : {})}>
        {props.state === 'loading' && <CommandLoading>{loadingMessage}</CommandLoading>}
        {props.state === 'empty' && <CommandEmpty>{emptyMessage}</CommandEmpty>}
        {props.state === 'results' && (props.items ?? children)}
      </CommandList>
    </UiCommand>
  )
}
