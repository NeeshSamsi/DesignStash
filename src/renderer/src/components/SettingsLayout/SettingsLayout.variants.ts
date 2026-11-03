import { cva } from 'class-variance-authority'

// Figma SettingsLayout 223:4771: an 880×760 modal, a 208px section rail on surface-1 and a scrolling pane.
export const settingsLayoutVariants = cva(
  'flex h-settings-modal max-h-viewport w-settings-modal max-w-full overflow-clip rounded-xl border border-base bg-surface-2 text-foreground',
  {
    variants: {
      section: { 'my-stash': '', 'ai-model': '', tags: '', privacy: '', about: '' }
    },
    defaultVariants: { section: 'my-stash' }
  }
)

export const SETTINGS_RAIL = 'flex w-52 shrink-0 flex-col gap-0.5 bg-surface-1 px-3 py-5'
export const SETTINGS_PANE = 'flex min-w-0 flex-1 flex-col gap-5 pt-4 pr-4 pb-8 pl-8'
export const SETTINGS_BODY = 'flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pr-4'

/** A grouped container of rows (Figma: surface-1, border/subtle, radius 10 → xl). */
export const SETTINGS_GROUP =
  'flex flex-col overflow-clip rounded-xl border border-subtle bg-surface-1'
export const SETTINGS_ROW = 'flex items-center gap-4 px-4 py-3.5'
