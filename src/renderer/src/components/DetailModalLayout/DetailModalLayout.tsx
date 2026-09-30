import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  DETAIL_MODAL_LAYOUT_CONTRACT,
  DETAIL_MODAL_LAYOUT_DEFAULTS,
  type DetailModalLayoutContractProps
} from './DetailModalLayout.types'
import { detailModalLayoutVariants } from './DetailModalLayout.variants'

export interface DetailModalLayoutProps extends DetailModalLayoutContractProps {
  className?: string
}

/**
 * DetailModalLayout — Two-pane mockup detail inside Modal xl.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=222-4366
 * Today: DetailModal.tsx
 */
export function DetailModalLayout({ className, ...rest }: DetailModalLayoutProps) {
  const props = { ...DETAIL_MODAL_LAYOUT_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="DetailModalLayout" on the root element.
  return (
    <ScaffoldStub
      contract={DETAIL_MODAL_LAYOUT_CONTRACT}
      props={props}
      className={cn(
        detailModalLayoutVariants({ variant: props.variant, state: props.state }),
        className
      )}
    />
  )
}
