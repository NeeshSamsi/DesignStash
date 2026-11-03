import { app, net, shell } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import { buildLicencesText, nodePackageSource, type PackageSource } from '../app/licences'
import { GithubUpdateService, type UpdateService } from '../updates/update-service'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

export interface AboutDeps {
  updates: UpdateService
  packages: PackageSource
  /** Look for a release once at launch (at most daily). Off in dev and tests unless asked for. */
  launchCheck: boolean
}

/** True for a packaged app, or when DESIGNSTASH_UPDATE_CHECK=1 (to try the notice from `pnpm dev`). */
const launchCheckWanted = () => app.isPackaged || process.env.DESIGNSTASH_UPDATE_CHECK === '1'

/** About pane: updates and licences. The problem report is a boot handler. */
export function registerAboutHandlers(ctx: HandlerContext, deps?: Partial<AboutDeps>): void {
  const { settings } = ctx
  const updates =
    deps?.updates ??
    new GithubUpdateService({
      settings,
      currentVersion: app.getVersion(),
      fetch: (url, init) => net.fetch(url, init),
      openExternal: (url) => void shell.openExternal(url)
    })
  // The launch check runs in the background; the first status read waits for it so the app-wide
  // notice sees its result (the check gives up after a few seconds, so this is short).
  const launch =
    (deps?.launchCheck ?? launchCheckWanted()) && updates instanceof GithubUpdateService
      ? updates.checkIfDue()
      : Promise.resolve()
  const packages = deps?.packages ?? nodePackageSource(app.getAppPath())

  registerIpcHandler(IPC_CHANNELS.UPDATES_STATUS, async () => {
    await launch
    return updates.status()
  })
  registerIpcHandler(IPC_CHANNELS.UPDATES_CHECK, () => updates.check())
  registerIpcHandler(IPC_CHANNELS.UPDATES_CANCEL, () => {
    updates.cancel()
    return updates.status()
  })
  registerIpcHandler(IPC_CHANNELS.UPDATES_INSTALL, () => {
    // "Download" on an available release opens its page; `installing` is only true for a restart.
    updates.install()
    return { installing: updates.status().state === 'ready' }
  })

  registerIpcHandler(IPC_CHANNELS.LICENCES_TEXT, () => ({ text: buildLicencesText(packages) }))
}
