import { IPC_CHANNELS } from '@shared/ipc'
import { IntegrityService } from '../library/integrity-service'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

export function registerIntegrityHandlers({ settings, repo }: HandlerContext): void {
  const integrityService = new IntegrityService(repo, settings.getLibraryRoot())

  registerIpcHandler(IPC_CHANNELS.INTEGRITY_SCAN, () => integrityService.scan())

  registerIpcHandler(IPC_CHANNELS.INTEGRITY_ADD_ORPHAN, (args) =>
    integrityService.addOrphanFile(args.filePath)
  )

  registerIpcHandler(IPC_CHANNELS.INTEGRITY_DELETE_RECORD, (args) => {
    integrityService.deleteOrphanRecord(args.mockupId)
    return { deleted: true }
  })
}
