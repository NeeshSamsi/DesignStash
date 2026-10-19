import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  MODEL_CARD_CONTRACT,
  MODEL_CARD_DEFAULTS,
  type ModelCardContractProps
} from './ModelCard.types'
import { modelCardVariants } from './ModelCard.variants'

export interface ModelCardProps extends ModelCardContractProps {
  className?: string
}

/**
 * ModelCard — One on-device model in Settings › AI model, after Handy's model card: name, In use / Best fit tags and one plain line, quality and speed as five-step bars; a divider; languages, size and the actions. States: in-use (orange border, Delete) · downloaded (Delete · Use this model) · downloading (progress, Cancel) · available (Download) · failed (reason, Try again).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=795-9758
 * Today: SettingsAiPane.tsx
 */
export function ModelCard({ className, ...rest }: ModelCardProps) {
  const props = { ...MODEL_CARD_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="ModelCard" on the root element.
  return (
    <ScaffoldStub
      contract={MODEL_CARD_CONTRACT}
      props={props}
      className={cn(modelCardVariants({ state: props.state }), className)}
    />
  )
}
