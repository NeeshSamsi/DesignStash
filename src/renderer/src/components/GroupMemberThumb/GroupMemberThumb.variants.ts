import { cva } from 'class-variance-authority'

// Figma GroupMemberThumb 220:2979: a 128px tile, cover on top (92px), filename in a caption bar. Hover is CSS.
export const groupMemberThumbVariants = cva(
  'group/thumb relative w-32 overflow-clip rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring',
  {
    variants: {
      state: {
        idle: 'border border-subtle bg-surface-3 hover:border-strong',
        selected: 'border-2 border-primary bg-surface-3',
        // In hand while dragging: primary border and a lifted shadow.
        lifted: 'border border-primary bg-surface-3 shadow-xl',
        'left-behind': 'border border-dashed border-strong',
        'drop-ghost': 'h-31 border border-dashed border-primary bg-primary-weak',
        'pile-target': 'border-2 border-primary bg-surface-3'
      }
    },
    defaultVariants: { state: 'idle' }
  }
)

export const groupMemberCaptionVariants = cva(
  'flex min-h-8 items-center px-2 py-1.5 type-caption-xs-regular',
  {
    variants: {
      state: {
        idle: 'text-muted-foreground group-hover/thumb:text-foreground',
        selected: 'bg-primary text-on-primary',
        lifted: 'text-foreground',
        'left-behind': 'opacity-0',
        'drop-ghost': '',
        'pile-target': 'text-foreground'
      }
    },
    defaultVariants: { state: 'idle' }
  }
)
