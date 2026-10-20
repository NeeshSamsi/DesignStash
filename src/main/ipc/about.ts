import { app } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import { buildLicencesText, nodePackageSource, type PackageSource } from '../app/licences'
import { NoopUpdateService, type UpdateService } from '../updates/update-service'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

export interface AboutDeps {
  updates: UpdateService
  packages: PackageSource
}

/** About pane: updates and licences. The problem report is a boot handler. */
export function registerAboutHandlers(ctx: HandlerContext, deps?: Partial<AboutDeps>): void {
  const { settings } = ctx
  const updates = deps?.updates ?? new NoopUpdateService(settings)
  const packages = deps?.packages ?? nodePackageSource(app.getAppPath())

  registerIpcHandler(IPC_CHANNELS.UPDATES_STATUS, () => updates.status())
  registerIpcHandler(IPC_CHANNELS.UPDATES_CHECK, () => updates.check())
  registerIpcHandler(IPC_CHANNELS.UPDATES_CANCEL, () => {
    updates.cancel()
    return updates.status()
  })
  registerIpcHandler(IPC_CHANNELS.UPDATES_INSTALL, () => {
    updates.install()
    return { installing: updates.status().state === 'ready' }
  })

  registerIpcHandler(IPC_CHANNELS.LICENCES_TEXT, () => ({ text: buildLicencesText(packages) }))
}
