import { release } from 'node:os'
import { app, clipboard } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import { buildLicencesText, nodePackageSource, type PackageSource } from '../app/licences'
import { buildReport } from '../app/report'
import { NoopUpdateService, type UpdateService } from '../updates/update-service'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

export interface AboutDeps {
  updates: UpdateService
  packages: PackageSource
  writeClipboard: (text: string) => void
  version: () => string
}

/** About pane: updates, licences and the problem report. */
export function registerAboutHandlers(ctx: HandlerContext, deps?: Partial<AboutDeps>): void {
  const { settings, repo } = ctx
  const updates = deps?.updates ?? new NoopUpdateService(settings)
  const packages = deps?.packages ?? nodePackageSource(app.getAppPath())
  const writeClipboard = deps?.writeClipboard ?? ((text) => clipboard.writeText(text))
  const version = deps?.version ?? (() => app.getVersion())

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

  registerIpcHandler(IPC_CHANNELS.REPORT_COPY, () => {
    const counts = repo.getInboxCounts()
    writeClipboard(
      buildReport({
        version: version(),
        electron: process.versions.electron ?? 'unknown',
        platform: process.platform,
        arch: process.arch,
        osRelease: release(),
        stashCount: repo.getLibraryStats().total,
        toSort: counts.toSort,
        toStash: counts.toStash,
        trash: counts.trash,
        stashCheck: settings.get().stashCheck?.result ?? 'not checked yet',
        aiModel: settings.get().activeModelId ?? 'none'
      })
    )
    return { copied: true }
  })
}
