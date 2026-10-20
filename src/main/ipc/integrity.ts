import { dialog } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import { IntegrityService, type IntegrityDeps } from '../library/integrity-service'
import { StashCheckStatus } from '../library/stash-check-status'
import type { Repository } from '../db/repository'
import type { HandlerContext } from './context'
import { countsChanged, mockupsArrived, mockupsLeft } from './library-effects'
import { registerIpcHandler } from './register'

/** The ignore list lives in settings, so it survives a restart. */
function ignoredStore(settings: HandlerContext['settings']): IntegrityDeps['ignored'] {
  return {
    get: () => settings.get().ignoredDrift,
    set: (ids) => void settings.update({ ignoredDrift: ids })
  }
}

/** The one integrity service, used by the launch scan and the handlers so both honour the same ignore list. */
export function createIntegrityService(
  repo: Repository,
  settings: HandlerContext['settings'],
  deps: Partial<IntegrityDeps> = {}
): IntegrityService {
  return new IntegrityService(repo, settings.getLibraryRoot(), {
    ignored: ignoredStore(settings),
    ...deps
  })
}

/** The one stash check status, shared by the launch scan and the Settings handlers. */
export function createStashCheck(
  settings: HandlerContext['settings'],
  integrity: IntegrityService
): StashCheckStatus {
  return new StashCheckStatus(settings, () => integrity.scan())
}

async function pickPsd(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'PSD Files', extensions: ['psd'] }]
  })
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

export function registerIntegrityHandlers(
  ctx: HandlerContext,
  pick: () => Promise<string | null> = pickPsd
): void {
  const { settings, repo } = ctx
  const integrityService = createIntegrityService(repo, settings, { pickFile: pick })
  const stashCheck = createStashCheck(settings, integrityService)

  /** Whatever changed, Settings should read the state it is in now. A failed check records that it failed. */
  const recheck = async <T>(result: T): Promise<T> => {
    await stashCheck.run('manual')
    return result
  }
  const added = async (mockupIds: number[]): Promise<{ mockupIds: number[] }> => {
    mockupsArrived(ctx, mockupIds)
    countsChanged(ctx)
    return recheck({ mockupIds })
  }

  registerIpcHandler(IPC_CHANNELS.STASH_CHECK_STATUS, () => stashCheck.get())

  registerIpcHandler(IPC_CHANNELS.STASH_CHECK_RUN, () => stashCheck.run('manual'))

  registerIpcHandler(IPC_CHANNELS.INTEGRITY_REPORT, () => integrityService.report())

  registerIpcHandler(IPC_CHANNELS.INTEGRITY_ADD, async (args) =>
    added((await integrityService.add(args.ids)).mockupIds)
  )

  registerIpcHandler(IPC_CHANNELS.INTEGRITY_ADD_ALL, async () =>
    added((await integrityService.addAll()).mockupIds)
  )

  registerIpcHandler(IPC_CHANNELS.INTEGRITY_UNDO_ADD, async (args) => {
    mockupsLeft(ctx, args.mockupIds)
    await integrityService.undoAdd(args.mockupIds)
    countsChanged(ctx)
    return recheck({ undone: true })
  })

  /** Removed records change the sidebar counts. (Their queued suggestions need ids: see X2-1.) */
  const removed = async (result: { removed: number }): Promise<{ removed: number }> => {
    countsChanged(ctx)
    return recheck(result)
  }

  registerIpcHandler(IPC_CHANNELS.INTEGRITY_REMOVE, async (args) =>
    removed(await integrityService.remove(args.ids))
  )

  registerIpcHandler(IPC_CHANNELS.INTEGRITY_REMOVE_ALL, async () =>
    removed(await integrityService.removeAll())
  )

  registerIpcHandler(IPC_CHANNELS.INTEGRITY_RELINK, async (args) =>
    recheck(await integrityService.relink(args.id))
  )

  registerIpcHandler(IPC_CHANNELS.INTEGRITY_IGNORE, async (args) =>
    recheck(await integrityService.ignore(args.ids))
  )

  registerIpcHandler(IPC_CHANNELS.INTEGRITY_IGNORE_ALL, async () =>
    recheck(await integrityService.ignoreAll())
  )

  registerIpcHandler(IPC_CHANNELS.INTEGRITY_UNIGNORE, async (args) => {
    await integrityService.unignore(args.ids)
    return recheck({ restored: true })
  })
}
