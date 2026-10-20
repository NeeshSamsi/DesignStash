import { cva } from 'class-variance-authority'

// Figma OnboardingStep 223:4473: one page inside CenteredLayout, 480 wide, 32 between the progress
// marks, the heading, the content and the footer.
export const onboardingStepVariants = cva('flex w-full flex-col gap-8', {
  variants: {
    variant: {
      welcome: '',
      standard: ''
    }
  },
  defaultVariants: { variant: 'welcome' }
})

export const onboardingStepTitleVariants = cva('text-foreground', {
  variants: {
    variant: {
      welcome: 'type-display-3xl-semibold',
      standard: 'type-display-2xl-medium'
    }
  },
  defaultVariants: { variant: 'welcome' }
})
