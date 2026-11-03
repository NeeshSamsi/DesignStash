import { cva } from 'class-variance-authority'

// Figma PageHeader 216:1656. page = breadcrumb title at 24px; section = 18px semibold title.
export const pageHeaderVariants = cva('flex w-full flex-col', {
  variants: {
    variant: {
      page: 'gap-2',
      section: 'gap-1'
    }
  },
  defaultVariants: { variant: 'page' }
})

export const pageHeaderRowClass = 'flex items-center justify-between gap-4'
export const pageHeaderTitleVariants = cva('flex min-w-0 items-center gap-1 text-foreground', {
  variants: {
    variant: {
      page: 'type-display-2xl-regular',
      section: 'type-title-lg-semibold'
    }
  },
  defaultVariants: { variant: 'page' }
})
export const pageHeaderCurrentClass = 'type-display-2xl-medium'
export const pageHeaderDescriptionClass = 'type-body-sm-regular text-muted-foreground'
