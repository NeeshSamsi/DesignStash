import { cva } from 'class-variance-authority'

// Figma ModelPicker 278:5325: the hardware card, then an accordion panel headed by the AI switch.
export const modelPickerVariants = cva('flex w-full flex-col gap-6', {
  variants: {
    ai: {
      on: '',
      off: ''
    }
  },
  defaultVariants: { ai: 'on' }
})

/** The panel keeps its border in both states; Off leaves just the header. */
export const modelPickerPanelVariants = cva(
  'flex w-full flex-col overflow-clip rounded-xl border border-base',
  {
    variants: {
      ai: {
        on: '',
        off: ''
      }
    },
    defaultVariants: { ai: 'on' }
  }
)
