import { cva } from 'class-variance-authority'

// Figma ModelCard 795:9758 (after Handy's model card). No fill in any state: the model in use has an
// orange border (border/primary), every other state border/subtle. The Figma radius is 10px, which has
// no token, so it is rounded-xl.
export const modelCardVariants = cva('flex w-full flex-col gap-3 rounded-xl border px-4 py-3', {
  variants: {
    state: {
      'in-use': 'border-primary',
      downloaded: 'border-subtle',
      downloading: 'border-subtle',
      available: 'border-subtle',
      failed: 'border-subtle'
    }
  },
  defaultVariants: { state: 'in-use' }
})

/** One of the five steps of a quality or speed bar: 12×4. Filled steps are orange on the model in use. */
export const modelCardStepVariants = cva('h-1 w-3 rounded-xs', {
  variants: {
    filled: {
      none: 'bg-surface-3',
      muted: 'bg-input',
      accent: 'bg-primary'
    }
  },
  defaultVariants: { filled: 'none' }
})
