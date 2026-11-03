import { cva } from 'class-variance-authority'

// Static (catalog) layout only: the live tooltip is ui/tooltip.tsx with Radix placing the arrow.
// The arrow track sits on the named edge: top/left tracks come first (reversed flex order).
export const tooltipVariants = cva('inline-flex w-fit', {
  variants: {
    arrow: {
      'top-left': 'flex-col-reverse',
      top: 'flex-col-reverse',
      'top-right': 'flex-col-reverse',
      'right-top': 'flex-row',
      right: 'flex-row',
      'right-bottom': 'flex-row',
      'bottom-right': 'flex-col',
      bottom: 'flex-col',
      'bottom-left': 'flex-col',
      'left-bottom': 'flex-row-reverse',
      left: 'flex-row-reverse',
      'left-top': 'flex-row-reverse',
      none: ''
    }
  },
  defaultVariants: { arrow: 'top-left' }
})

// 14×7 track (12px inset along the edge, as in Figma) that clips the turned square to a triangle.
const across = 'flex h-1.75 overflow-hidden px-3.5'
const down = 'flex w-1.75 flex-col overflow-hidden py-1'

export const tooltipArrowTrackVariants = cva('', {
  variants: {
    arrow: {
      'top-left': `${across} items-end justify-start`,
      top: `${across} items-end justify-center`,
      'top-right': `${across} items-end justify-end`,
      'right-top': `${down} items-start justify-start`,
      right: `${down} items-start justify-center`,
      'right-bottom': `${down} items-start justify-end`,
      'bottom-right': `${across} items-start justify-end`,
      bottom: `${across} items-start justify-center`,
      'bottom-left': `${across} items-start justify-start`,
      'left-bottom': `${down} items-end justify-end`,
      left: `${down} items-end justify-center`,
      'left-top': `${down} items-end justify-start`,
      none: 'hidden'
    }
  },
  defaultVariants: { arrow: 'top-left' }
})
