import * as React from "react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

import { cn } from "@renderer/lib/utils"

// Lets an item tell whether a RadioGroup already wraps it (Radix items can't stand alone).
const RadioGroupContext = React.createContext(false)

function useInRadioGroup() {
  return React.useContext(RadioGroupContext)
}

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupContext.Provider value>
      <RadioGroupPrimitive.Root
        data-slot="radio-group"
        className={cn("grid w-full gap-2", className)}
        {...props}
      />
    </RadioGroupContext.Provider>
  )
}

// Figma RadioGroup 212:388 radio: 16px ring on surface-2; selected = border/primary ring + 8px primary dot.
function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "group/radio-group-item peer relative flex aspect-square size-4 shrink-0 rounded-full border border-strong bg-surface-2 outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-error data-checked:border-primary",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-full items-center justify-center"
      >
        <span className="size-2 rounded-full bg-primary" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem, useInRadioGroup }
