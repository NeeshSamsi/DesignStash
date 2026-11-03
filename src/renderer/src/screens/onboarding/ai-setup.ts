import type { AiDownloadProgress, AiModelInfo } from '@shared/ipc/ai'
import type { ModelRowState } from '@renderer/components/ModelRow/ModelRow.types'
import { modelPhase, type HardwareInfo } from './model-phase'
import {
  downloadFailureCopy,
  downloadRate,
  downloadRemaining,
  formatBytes
} from '../settings/settings-copy'

/** The model to pick first: the one marked best fit, else the recommended tier, else the first. */
export function defaultSelection(
  models: readonly AiModelInfo[],
  hardware: HardwareInfo | null
): string | null {
  return (
    models.find((m) => m.bestFit)?.id ??
    models.find((m) => hardware && m.tier === hardware.recommendedTier)?.id ??
    models[0]?.id ??
    null
  )
}

const TIER_LINE = {
  small: 'small · fastest',
  medium: 'medium · better titles and tags',
  large: 'large · best descriptions'
} as const

/** "2.1 GB · medium · better titles and tags". */
export const modelDetail = (model: AiModelInfo) =>
  `${formatBytes(model.sizeBytes)} · ${TIER_LINE[model.tier]}`

export interface RowView {
  state: ModelRowState
  percent: number
  progressText: string
  failureReason: string
}

/** What one model's row shows, from the list and the latest download event for it. */
export function rowView(model: AiModelInfo, event: AiDownloadProgress | null): RowView {
  const status = modelPhase(model, event)
  const sizeLine = (extra: string) =>
    [`${formatBytes(status.receivedBytes)} of ${formatBytes(status.totalBytes)}`, extra]
      .filter(Boolean)
      .join(' · ')
  const state: ModelRowState = status.phase
  const speed = [downloadRate(status.bytesPerSecond), downloadRemaining(status.secondsLeft)]
    .filter(Boolean)
    .join(' · ')
  const progressText =
    status.phase === 'downloading'
      ? sizeLine(speed)
      : status.phase === 'paused'
        ? sizeLine('paused')
        : ''
  return {
    state,
    percent: status.percent,
    progressText,
    failureReason: status.phase === 'failed' ? downloadFailureCopy(status.reason) : ''
  }
}

/** Which of the A3 screens this is. */
export type AiScreen =
  | 'loading'
  | 'unsupported'
  | 'empty'
  | 'choose'
  | 'skipped'
  | 'downloading'
  | 'verifying'
  | 'complete'
  | 'failed'

export interface AiScreenInput {
  loaded: boolean
  hardware: HardwareInfo | null
  models: readonly AiModelInfo[]
  aiOn: boolean
  selected: AiModelInfo | null
  event: AiDownloadProgress | null
}

export function aiScreen(input: AiScreenInput): AiScreen {
  if (!input.loaded) return 'loading'
  if (input.hardware && !input.hardware.isAppleSilicon) return 'unsupported'
  if (input.models.length === 0) return 'empty'
  if (!input.aiOn) return 'skipped'
  const row = input.selected ? rowView(input.selected, input.event) : null
  if (row?.state === 'downloading') return 'downloading'
  if (row?.state === 'verifying') return 'verifying'
  if (row?.state === 'failed') return 'failed'
  if (row?.state === 'installed') return 'complete'
  return 'choose'
}

/** A partial download left behind by an earlier launch, for the "Pick up where you left off?" dialog. */
export function partialDownload(models: readonly AiModelInfo[]): AiModelInfo | null {
  return models.find((m) => !m.installed && m.downloadedBytes > 0) ?? null
}

export interface HardwareView {
  variant: 'supported' | 'unsupported' | 'low-disk'
  title: string
  description: string
  badge: string
}

/** The "this Mac" card: the chip and memory, what it can run, and a warning when it can't. */
export function hardwareView(
  hardware: HardwareInfo,
  selected: AiModelInfo | null,
  failure: AiDownloadProgress['reason'] | null
): HardwareView {
  const title = `${hardware.chip} · ${Math.round(hardware.totalMemoryGB)} GB memory`
  if (!hardware.isAppleSilicon) {
    return {
      variant: 'unsupported',
      title,
      description:
        'On-device AI needs Apple Silicon. Everything else works, and titles come from file names.',
      badge: 'Not supported'
    }
  }
  if (failure === 'disk-full') {
    const size = selected ? `needs ${formatBytes(selected.sizeBytes)}` : 'needs more room'
    return {
      variant: 'low-disk',
      title,
      description: `The ${selected?.name ?? 'recommended'} model ${size}. Free up some space or try a smaller model.`,
      badge: 'Low disk'
    }
  }
  return {
    variant: 'supported',
    title,
    description: `Your Mac can comfortably run ${hardware.recommendedTier} models.`,
    badge: 'Apple Silicon'
  }
}

/** The page title and body for an A3 screen. Complete is the only one that changes them. */
export function aiHeading(
  screen: AiScreen,
  base: { title: string; body: string },
  model: AiModelInfo | null
): { title: string; body: string } {
  if (screen === 'complete' && model) {
    return {
      title: 'Your AI model is ready to go',
      body: `${model.name} is installed and switched on. From now on, everything you gather gets titles and tags automatically.`
    }
  }
  return base
}
