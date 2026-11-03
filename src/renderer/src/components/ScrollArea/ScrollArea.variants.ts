import { cva } from 'class-variance-authority'

// Styles live in ui/scroll-area.tsx (shadcn, restyled from Figma); ScrollArea.tsx maps the Figma props onto it.
// The slots stay empty: they only keep ds:check's Figma option coverage.
export const scrollAreaVariants = cva('')
