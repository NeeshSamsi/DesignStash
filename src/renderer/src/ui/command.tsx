import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Command as CommandPrimitive } from "cmdk"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search02Icon } from "@hugeicons/core-free-icons"

import { cn } from "@renderer/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@renderer/ui/dialog"
import { Spinner } from "@renderer/ui/spinner"

const commandVariants = cva(
  "flex flex-col overflow-hidden border border-base bg-surface-2 text-foreground",
  {
    variants: {
      variant: {
        // Inline tag combobox (288 wide, usually inside a Popover).
        default: "w-72 rounded-lg",
        // ⌘K palette (512 wide).
        palette: "w-128 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Command({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof CommandPrimitive> &
  VariantProps<typeof commandVariants>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(commandVariants({ variant }), className)}
      {...props}
    />
  )
}

function CommandDialog({
  title = "Command palette",
  description = "Search for a command to run",
  children,
  className,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string
  description?: string
  className?: string
}) {
  return (
    <Dialog {...props}>
      <DialogContent
        showCloseButton={false}
        className={cn("w-auto max-w-none gap-0 border-0 bg-transparent p-0", className)}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        <Command variant="palette">{children}</Command>
      </DialogContent>
    </Dialog>
  )
}

/** Search field over the list. `children` sit at its end (e.g. a KeyboardShortcut). */
function CommandInput({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex items-center gap-2 border-b border-subtle px-3 py-2.5"
    >
      <HugeiconsIcon icon={Search02Icon} className="size-4 shrink-0 text-tertiary" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "min-w-0 flex-1 bg-transparent type-body-sm-regular text-foreground outline-hidden placeholder:text-placeholder disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
      {children}
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn("max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto p-1", className)}
      {...props}
    />
  )
}

const commandStatusClass =
  "flex items-center justify-center gap-2 px-4 py-6 type-body-sm-regular text-tertiary"

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn(commandStatusClass, className)}
      {...props}
    />
  )
}

function CommandLoading({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Loading>) {
  return (
    <CommandPrimitive.Loading
      data-slot="command-loading"
      className={cn(commandStatusClass, className)}
      {...props}
    >
      <Spinner size="sm" />
      {children}
    </CommandPrimitive.Loading>
  )
}

function CommandGroup({
  heading,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      heading={
        heading !== undefined && (
          <span className="mb-0.5 block px-2 py-1.5 type-label-xs-medium text-muted-foreground">
            {heading}
          </span>
        )
      }
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("my-0.5 border-t border-subtle", className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 type-body-sm-regular text-foreground outline-hidden select-none not-first:mt-0.5 data-selected:bg-surface-2-hover data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

/** Trailing meta on an item (use count, hint). */
function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn("ml-auto type-caption-xs-regular text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
  CommandSeparator,
  CommandShortcut,
  commandVariants,
}
