import { ArrowReloadHorizontalIcon, WifiDisconnected01Icon } from '@hugeicons/core-free-icons'
import { ChoiceDialog } from '@renderer/components/ChoiceDialog'
import { EmptyState } from '@renderer/components/EmptyState'
import { HardwareSummary } from '@renderer/components/HardwareSummary'
import { MeaningSearchCard } from '@renderer/components/MeaningSearchCard'
import { ModelPicker } from '@renderer/components/ModelPicker'
import { ModelRow } from '@renderer/components/ModelRow'
import { OnboardingStep } from '@renderer/components/OnboardingStep'
import { Switch } from '@renderer/components/Switch'
import { formatBytes, meaningLine } from '../settings/settings-copy'
import {
  aiHeading,
  aiScreen,
  downloadLabel,
  hardwareView,
  meaningCardState,
  modelDetail,
  rowView,
  type AiScreen
} from './ai-setup'
import { AI_STEP } from './onboarding-copy'
import { continueInBackground } from './background-download'
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

  /** A download in flight carries on without this step, and switches the model on when it lands. */
  const keepDownloading = () => {
    if (ai.aiOn && working && selected) continueInBackground(selected)
  }
  const leave = async () => {
    if (ai.aiOn && screen === 'complete') await ai.activate()
    else if (!ai.aiOn) ai.leaveWithoutAi()
    keepDownloading()
    onNext()
  }
  const back = () => {
    keepDownloading()
    onBack()
  }
  const skip = () => {
    ai.setAiOn(false)
    ai.leaveWithoutAi()
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
        {...(model.builtIn ? { installedLabel: 'Built in' } : {})}
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
      <div className="flex flex-col gap-3">
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
        {ai.meaning && screen !== 'unsupported' && (
          <MeaningSearchCard
            state={meaningCardState(ai.meaning, ai.meaningEvent, ai.meaningOn)}
            status={meaningLine(ai.meaning, ai.meaningEvent, ai.meaningOn)}
            onCheckedChange={ai.setMeaningOn}
          />
        )}
      </div>
    )
  }

  const footer = footerFor(screen)
  // Download says how much it fetches: the picked model, plus meaning search while it is switched on.
  const primaryLabel =
    screen === 'choose'
      ? downloadLabel(selected, ai.meaning, ai.meaningEvent, ai.meaningOn)
      : footer.primary

  return (
    <>
      <OnboardingStep
        variant="standard"
        step="3"
        title={heading.title}
        body={heading.body}
        content={content}
        footer={screen !== 'empty'}
        primaryLabel={primaryLabel}
        skipLabel="Skip AI"
        {...(footer.skip ? { onSkip: skip } : {})}
        onBack={back}
        onPrimary={() => {
          if (screen === 'choose' || screen === 'failed') void ai.download()
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
    case 'failed':
      return { primary: 'Retry download', skip: true }
    case 'empty':
      return { primary: 'Try again', skip: true }
    default:
      return { primary: 'Continue', skip: false }
  }
}
