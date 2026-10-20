import { ArrowReloadHorizontalIcon, WifiDisconnected01Icon } from '@hugeicons/core-free-icons'
import { ChoiceDialog } from '@renderer/components/ChoiceDialog'
import { EmptyState } from '@renderer/components/EmptyState'
import { HardwareSummary } from '@renderer/components/HardwareSummary'
import { ModelPicker } from '@renderer/components/ModelPicker'
import { ModelRow } from '@renderer/components/ModelRow'
import { OnboardingStep } from '@renderer/components/OnboardingStep'
import { Switch } from '@renderer/components/Switch'
import { formatBytes } from '../settings/settings-copy'
import { aiHeading, aiScreen, hardwareView, modelDetail, rowView, type AiScreen } from './ai-setup'
import { AI_STEP } from './onboarding-copy'
import { useAiSetup } from './useAiSetup'

export interface AiStepProps {
  onBack: () => void
  onNext: () => void
}

const WORKING: readonly AiScreen[] = ['downloading', 'verifying']

/**
 * A3 · AI setup. One screen with the states between choosing and having a model: choose, skipped,
 * downloading, verifying, complete, failed (no connection, disk space), unsupported and empty.
 * Figma: ↳ Start › A3 · AI setup.
 */
export function AiStep({ onBack, onNext }: AiStepProps) {
  const ai = useAiSetup()
  const selected = ai.models.find((m) => m.id === ai.selectedId) ?? null
  const screen = aiScreen({
    loaded: ai.loaded,
    hardware: ai.hardware,
    models: ai.models,
    aiOn: ai.aiOn,
    selected,
    event: ai.event
  })
  const working = WORKING.includes(screen)
  const failure =
    screen === 'failed' && ai.event?.phase === 'error' ? (ai.event.reason ?? null) : null
  const heading = aiHeading(screen, AI_STEP, selected)

  const leave = async () => {
    if (ai.aiOn && screen === 'complete') await ai.activate()
    onNext()
  }
  const skip = () => {
    ai.setAiOn(false)
    onNext()
  }

  const hardware = ai.hardware ? hardwareView(ai.hardware, selected, failure) : null
  const hardwareCard = hardware && (
    <HardwareSummary
      variant={hardware.variant}
      title={hardware.title}
      description={hardware.description}
      badge={hardware.badge}
    />
  )

  const rows = ai.models.slice(0, 3).map((model) => {
    const view = rowView(model, ai.event)
    return (
      <ModelRow
        key={model.id}
        state={view.state}
        name={model.name}
        detail={modelDetail(model)}
        recommended={model.bestFit && view.state !== 'installed'}
        selected={model.id === ai.selectedId}
        percent={view.percent}
        progressText={view.progressText}
        failureReason={view.failureReason}
        {...(working ? {} : { onSelect: () => ai.select(model.id) })}
        onPause={() => void ai.cancel()}
        onResume={() => void ai.download(model.id)}
        onRetry={() => void ai.download(model.id)}
      />
    )
  })

  let content = null
  if (screen === 'empty') {
    content = (
      <EmptyState
        variant="inline"
        icon={WifiDisconnected01Icon}
        title="We couldn’t load the model list"
        description="Check your connection and try again, or skip AI for now and turn it on later in Settings."
        primaryLabel="Try again"
        primaryIcon={ArrowReloadHorizontalIcon}
        onPrimary={() => void ai.reload()}
        secondaryAction
        secondaryLabel="Skip AI"
        onSecondary={skip}
      />
    )
  } else if (screen !== 'loading') {
    content = (
      <ModelPicker
        ai={screen === 'skipped' ? 'off' : 'on'}
        hardware={hardwareCard}
        aiSwitch={
          <Switch
            showLabel={false}
            checked={ai.aiOn && screen !== 'unsupported'}
            disabled={working || screen === 'unsupported'}
            onCheckedChange={ai.setAiOn}
            aria-label="Use on-device AI"
          />
        }
        model1={rows[0]}
        model2={rows[1]}
        model3={rows[2]}
      />
    )
  }

  const footer = footerFor(screen)

  return (
    <>
      <OnboardingStep
        variant="standard"
        step="3"
        title={heading.title}
        body={heading.body}
        content={content}
        footer={screen !== 'empty'}
        busy={screen === 'verifying'}
        busyLabel="Checking…"
        primaryLabel={footer.primary}
        skipLabel="Skip AI"
        {...(footer.skip ? { onSkip: skip } : {})}
        {...(working ? {} : { onBack })}
        onPrimary={() => {
          if (screen === 'downloading') void ai.cancel()
          else if (screen === 'choose' || screen === 'failed') void ai.download()
          else if (screen === 'empty') void ai.reload()
          else void leave()
        }}
      />
      <ChoiceDialog
        open={ai.partial !== null && screen === 'choose'}
        title="Pick up where you left off?"
        description={
          ai.partial
            ? `You got ${formatBytes(ai.partial.downloadedBytes)} of ${formatBytes(ai.partial.sizeBytes)} before DesignStash closed.`
            : ''
        }
        tertiaryLabel="Skip AI"
        onTertiary={skip}
        secondaryLabel="Start over"
        onSecondary={() => ai.partial && void ai.startOver(ai.partial.id)}
        primaryLabel="Resume"
        onPrimary={() => ai.partial && void ai.download(ai.partial.id)}
      />
    </>
  )
}

function footerFor(screen: AiScreen): { primary: string; skip: boolean } {
  switch (screen) {
    case 'choose':
      return { primary: 'Download', skip: true }
    case 'downloading':
      return { primary: 'Cancel download', skip: false }
    case 'failed':
      return { primary: 'Retry download', skip: true }
    case 'empty':
      return { primary: 'Try again', skip: true }
    default:
      return { primary: 'Continue', skip: false }
  }
}
