import * as React from 'react'

import { cn } from '@renderer/lib/utils'

// A plain scroll region. Its bar is the app-wide overlay scrollbar (lib/overlay-scrollbars.ts, main.css),
// the same one every other scroll area gets, so there is nothing to style here.
function ScrollArea({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="scroll-area" className={cn('overflow-auto', className)} {...props} />
}

export { ScrollArea }
