import { IPC_CHANNELS } from '@shared/ipc'
import { IntegrityService } from '../library/integrity-service'
import { StashCheckStatus } from '../library/stash-check-status'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

/** The one stash check status, shared by the launch scan and the Settings handlers. */
export function createStashCheck(
  settings: HandlerContext['settings'],
  integrity: IntegrityService
): StashCheckStatus {
  return new StashCheckStatus(settings, () => integrity.scan())
}

export function registerIntegrityHandlers({ settings, repo }: HandlerContext): void {
  const integrityService = new IntegrityService(repo, settings.getLibraryRoot())
  const stashCheck = createStashCheck(settings, integrityService)

  registerIpcHandler(IPC_CHANNELS.INTEGRITY_SCAN, () => integrityService.scan())

  registerIpcHandler(IPC_CHANNELS.STASH_CHECK_STATUS, () => stashCheck.get())

  registerIpcHandler(IPC_CHANNELS.STASH_CHECK_RUN, () => stashCheck.run('manual'))

  registerIpcHandler(IPC_CHANNELS.INTEGRITY_ADD_ORPHAN, (args) =>
    integrityService.addOrphanFile(args.filePath)
  )

  registerIpcHandler(IPC_CHANNELS.INTEGRITY_DELETE_RECORD, (args) => {
    integrityService.deleteOrphanRecord(args.mockupId)
    return { deleted: true }
  })
}
