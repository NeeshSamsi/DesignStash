import type { AiDownloadFailure, AiDownloadProgress, AiModelInfo } from '@shared/ipc/ai'

/** This Mac, as main reports it. The one hardware type onboarding and Settings share. */
export interface HardwareInfo {
  chip: string
  totalMemoryGB: number
  isAppleSilicon: boolean
  recommendedTier: AiModelInfo['tier']
}

export type ModelPhase =
  | 'not-installed'
  | 'downloading'
  | 'paused'
  | 'verifying'
  | 'failed'
  | 'installed'

export interface ModelStatus {
  phase: ModelPhase
  /** 0 to 100. */
  percent: number
  receivedBytes: number
  totalBytes: number
  bytesPerSecond: number | undefined
  secondsLeft: number | null | undefined
  reason: AiDownloadFailure | undefined
}

const percentOf = (received: number, total: number) =>
  total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0

/**
 * Where one model is, from the catalogue entry and the latest download event for it. Onboarding and
 * Settings both read this, so the same half-downloaded model reads the same in both.
 */
export function modelPhase(model: AiModelInfo, event: AiDownloadProgress | null): ModelStatus {
  const live = event && event.modelId === model.id ? event : null
  const status = (phase: ModelPhase, received: number, total: number): ModelStatus => ({
    phase,
    percent: phase === 'installed' || phase === 'verifying' ? 100 : percentOf(received, total),
    receivedBytes: received,
    totalBytes: total,
    bytesPerSecond: live?.bytesPerSecond,
    secondsLeft: live?.secondsLeft,
    reason: live?.reason
  })

  if (live?.phase === 'downloading') {
    return status('downloading', live.receivedBytes, live.totalBytes)
  }
  if (live?.phase === 'verifying') return status('verifying', live.receivedBytes, live.totalBytes)
  if (live?.phase === 'error') return status('failed', live.receivedBytes, live.totalBytes)
  if (model.installed || live?.phase === 'done') {
    return status('installed', model.sizeBytes, model.sizeBytes)
  }
  if (model.downloadedBytes > 0) return status('paused', model.downloadedBytes, model.sizeBytes)
  return status('not-installed', 0, model.sizeBytes)
}
