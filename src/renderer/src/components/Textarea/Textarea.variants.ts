import { cva } from 'class-variance-authority'
import { WRITING_CLASS } from '@renderer/lib/writing-field'

// Styles live in ui/textarea.tsx (shadcn, restyled from Figma); Textarea.tsx maps the Figma props onto it.
export const textareaVariants = cva('', {
  variants: {
    // 4 to 6 rows: at least four lines, then it grows to six and scrolls (the approval description).
    rowRange: { '3': '', '4-6': 'max-h-40 min-h-28 overflow-y-auto' },
    state: {
      default: '',
      // A field the AI just filled: the tint fades out (look-over.md, L6.3).
      'ai-filled': 'motion-safe:animate-ai-tint motion-reduce:animate-ai-tint-hold',
      writing: WRITING_CLASS
    }
  },
  defaultVariants: { rowRange: '3', state: 'default' }
})
