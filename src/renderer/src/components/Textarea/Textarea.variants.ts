import { cva } from 'class-variance-authority'

// Styles live in ui/textarea.tsx (shadcn, restyled from Figma); Textarea.tsx maps the Figma props onto it.
// The slots stay empty: they only keep ds:check's Figma option coverage.
export const textareaVariants = cva('')
