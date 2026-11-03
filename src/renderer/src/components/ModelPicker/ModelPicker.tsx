import { useId, type ComponentProps, type ReactNode } from 'react'
import { HardwareSummary } from '@renderer/components/HardwareSummary'
import { ModelRow } from '@renderer/components/ModelRow'
import { Switch } from '@renderer/components/Switch'
import { cn } from '@renderer/lib/utils'
import { MODEL_PICKER_DEFAULTS, type ModelPickerContractProps } from './ModelPicker.types'
import { modelPickerPanelVariants, modelPickerVariants } from './ModelPicker.variants'

export interface ModelPickerProps
  extends
    ModelPickerContractProps,
    Omit<ComponentProps<'div'>, keyof ModelPickerContractProps | 'children'> {
  /** The switch. Off collapses the models and says titles come from file names. */
  onAiChange?: (on: boolean) => void
  /** The line under "Use on-device AI" when it is on. */
  onDescription?: string
  /** The same line when it is off. */
  offDescription?: string
  /** A third model under the two Figma slots: Apple's built-in model, when this Mac can run it. */
  model3?: ReactNode
}

/**
 * ModelPicker — Onboarding's model chooser: the hardware card, then an accordion headed by the "Use on-device AI" switch, with the models (a radio list of ModelRows) underneath while it is on.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=278-5325
 * Uses node 278:5325, the one in the snapshot (795:9729 is a duplicate). Settings › AI model mirrors
 * the accordion. The catalogue is Qwen3-VL 4B (the default, medium), Qwen3.5 9B (large, 16 GB+)
 * and, on macOS 27 with Apple Intelligence, Apple's built-in model in `model3`; Figma's sample rows
 * still show the old text models. Screens pass the real `hardware`, `aiSwitch` and model slots; the
 * defaults are samples.
 */
export function ModelPicker({
  className,
  onAiChange,
  onDescription = 'Pick a model below. It runs entirely on your Mac.',
  offDescription = 'Off for now. Titles will come from file names.',
  model3,
  ...rest
}: ModelPickerProps) {
  const { ai, hardware, aiSwitch, model1, model2, ...props } = {
    ...MODEL_PICKER_DEFAULTS,
    ...rest
  }
  const on = ai === 'on'
  const labelId = useId()
  return (
    <div
      data-ds="ModelPicker"
      data-ai={ai}
      className={cn(modelPickerVariants({ ai }), className)}
      {...props}
    >
      {hardware ?? <HardwareSummary />}
      <div className={modelPickerPanelVariants({ ai })}>
        <div className="flex w-full items-center gap-4 p-4">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p id={labelId} className="type-body-sm-medium text-foreground">
              Use on-device AI
            </p>
            <p className="type-caption-xs-regular text-tertiary">
              {on ? onDescription : offDescription}
            </p>
          </div>
          {aiSwitch ?? (
            <Switch
              showLabel={false}
              checked={on}
              onCheckedChange={(next) => onAiChange?.(next)}
              aria-labelledby={labelId}
            />
          )}
        </div>
        {on && (
          <div
            role="radiogroup"
            aria-labelledby={labelId}
            className="flex w-full flex-col gap-2 border-t border-subtle p-3"
          >
            {model1 ?? (
              <ModelRow
                name="Qwen 2.5 VL 3B"
                detail="2.8 GB · medium · better titles and tags"
                recommended
              />
            )}
            {model2 ?? (
              <ModelRow
                state="installed"
                name="Qwen 2.5 VL 7B"
                detail="5.5 GB · large · best descriptions, needs 16 GB or more"
              />
            )}
            {model3}
          </div>
        )}
      </div>
    </div>
  )
}
