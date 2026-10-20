import { cva } from 'class-variance-authority'

// Figma ConsentPanel 223:4275 (onboarding card) and the Privacy accordion in SettingsLayout 797:10163.
// The card is a surface-2 panel; the accordion is a surface-1 container headed by its switch.
export const consentPanelVariants = cva('flex w-full flex-col rounded-xl border border-subtle', {
  variants: {
    mode: {
      card: 'gap-5 bg-surface-2 p-6',
      accordion: 'overflow-clip bg-surface-1'
    }
  },
  defaultVariants: { mode: 'card' }
})
