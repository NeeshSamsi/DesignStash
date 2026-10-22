import type { StashCheckStatus, StashChangeFailure } from '@shared/stash'
import type { AiDownloadFailure, AiDownloadProgress, AiMeaningInfo } from '@shared/ipc/ai'
import { modelPhase } from '../onboarding/model-phase'

/** 14.2 GB, 412 MB, 3 KB. One decimal from GB up. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`
  return `${bytes} B`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "today 9:41", "yesterday 9:41", or "12 Oct, 9:41". */
export function formatWhen(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'not yet'
  const at = new Date(iso)
  const time = `${at.getHours()}:${pad(at.getMinutes())}`
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const gap = Math.round((day(now) - day(at)) / 86_400_000)
  if (gap === 0) return `today ${time}`
  if (gap === 1) return `yesterday ${time}`
  return `${at.getDate()} ${at.toLocaleString('en-GB', { month: 'short' })}, ${time}`
}

export const mockupCount = (n: number) => `${n} ${n === 1 ? 'mockup' : 'mockups'}`

/** Why a stash folder change did not happen, in plain words. The old folder is untouched. */
export function stashFailureCopy(reason: StashChangeFailure): {
  title: string
  description: string
} {
  const title = 'Couldn’t change your stash folder'
  const why: Record<StashChangeFailure, string> = {
    'same-folder': 'That’s already your stash folder. Pick a different one.',
    'inside-stash': 'That folder is inside your current stash. Pick one outside it.',
    'not-a-folder': 'That isn’t a folder. Pick a folder instead.',
    'not-empty': 'That folder already has files in it. Pick an empty one.',
    'not-writable': 'DesignStash can’t save files to that folder. Pick another one.',
    'no-space': 'There isn’t enough free space there. Pick a roomier drive.',
    'verify-failed':
      'Some files didn’t copy cleanly, so nothing was moved. Your stash is as it was.',
    failed: 'Something went wrong. Your stash is as it was. Try again.'
  }
  return { title, description: why[reason] }
}

/** Why a model download stopped, in plain words. Trying again resumes. */
export function downloadFailureCopy(reason: AiDownloadFailure | undefined): string {
  switch (reason) {
    case 'offline':
      return 'The download stopped. Check your connection, then try again.'
    case 'disk-full':
      return 'The download stopped because your disk is full. Free up some space, then try again.'
    case 'checksum':
      return 'The download came through damaged. Try again to fetch it fresh.'
    case 'server':
      return 'The download server isn’t responding. Try again in a little while.'
    default:
      return 'The download stopped. Check your connection, then try again.'
  }
}

/** "18 MB/s" and "about 3 min left", each left out when not yet known. */
export function downloadRate(bytesPerSecond: number | undefined): string {
  return bytesPerSecond && bytesPerSecond > 0 ? `${formatBytes(bytesPerSecond)}/s` : ''
}
export function downloadRemaining(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return ''
  if (seconds < 60) return 'less than a minute left'
  return `about ${Math.round(seconds / 60)} min left`
}

export type CheckView = {
  tone: 'none' | 'success' | 'warning' | 'error'
  tag: string | null
  line: string
  review: boolean
}

/** The Stash check row for a status. */
export function stashCheckView(status: StashCheckStatus, now: Date = new Date()): CheckView {
  const run = status.lastRun
  if (!run) return { tone: 'none', tag: null, line: 'Not checked yet', review: false }
  const when = formatWhen(run.at, now)
  const line =
    run.trigger === 'launch' ? `Checked when DesignStash opened, ${when}` : `Checked ${when}`
  if (run.result === 'in-sync') return { tone: 'success', tag: 'In sync', line, review: false }
  if (run.result === 'review') {
    return { tone: 'warning', tag: `${run.toReview} to review`, line, review: true }
  }
  return {
    tone: 'error',
    tag: 'Couldn’t check',
    line: `${line}. Something stopped the check.`,
    review: false
  }
}

/**
 * The one line onboarding shows for meaning search under the model choice: its size before it
 * starts, then how far it is, then ready, or where to retry.
 */
export function meaningLine(
  meaning: Pick<AiMeaningInfo, 'id' | 'installed' | 'sizeBytes' | 'downloadedBytes'>,
  event: AiDownloadProgress | null
): string {
  const status = modelPhase(meaning, event)
  switch (status.phase) {
    case 'installed':
      return 'Meaning search · ready'
    case 'downloading':
      return `Meaning search · downloading ${status.percent}%`
    case 'verifying':
      return 'Meaning search · checking the download'
    case 'failed':
      return 'Meaning search · couldn’t download. Try again in Settings › AI model.'
    default:
      return `Meaning search · ${formatBytes(meaning.sizeBytes)}`
  }
}
