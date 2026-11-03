import { cva } from 'class-variance-authority'
import { AI_FILLED_CLASS, WRITING_CLASS } from '@renderer/lib/writing-field'

// Styles live in ui/input.tsx (shadcn, restyled from Figma); Input.tsx maps the Figma props onto it.
// The variant slots stay empty: they only keep ds:check's Figma option coverage.
export const inputVariants = cva('', {
  variants: {
    variant: {
      text: '',
      search: '',
      'inline-title': ''
    },
    state: {
      default: '',
      // The AI is writing it (look-over.md, L6.1); Input.tsx shows it empty with the placeholder.
      writing: WRITING_CLASS,
      // The AI just filled it: the tint fades out (L6.3).
      'ai-filled': AI_FILLED_CLASS
    }
  },
  defaultVariants: { variant: 'text', state: 'default' }
})
