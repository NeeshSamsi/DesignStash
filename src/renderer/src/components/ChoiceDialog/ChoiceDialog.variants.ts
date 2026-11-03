import { cva } from 'class-variance-authority'

// Wider than ConfirmDialog (Figma 448); the data-[size] form beats ui/alert-dialog's own max width.
export const choiceDialogVariants = cva('w-112 gap-6 data-[size=default]:max-w-112')
