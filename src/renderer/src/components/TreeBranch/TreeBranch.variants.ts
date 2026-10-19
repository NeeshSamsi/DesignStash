import { cva } from 'class-variance-authority'

// Figma TreeBranch 233:4667: 16×32, stroke border/base. The curve is a bordered corner 12 wide
// (the stub stops 4px short of the child row); `middle` adds the line running on to the next row.
export const treeBranchVariants = cva('relative h-8 w-4 shrink-0', {
  variants: {
    position: {
      middle: '',
      last: ''
    }
  },
  defaultVariants: { position: 'middle' }
})

export const treeBranchCurveClass =
  'absolute top-0 left-0 h-4 w-3 rounded-bl-lg border-b border-l border-base'
export const treeBranchLineClass = 'absolute top-4 bottom-0 left-0 border-l border-base'
