import { app, net, protocol, session, shell } from 'electron'
import { join } from 'node:path'
import { createHandlerContext, type TelemetryRef } from './ipc/context'
import { registerAllHandlers, registerPreAppHandlers } from './ipc'
import { registerIpcHandler } from './ipc/register'
import { initDb, getDb, getSqlite, closeDb } from './db/connection'
import { runMigrations } from './db/migrate'
import { bootstrapLibrary, seedTaxonomy } from './db/bootstrap'
import { ensureSearchIndex } from './db/search-index'
import { runLaunchUpkeep } from './db/launch-upkeep'
import { applyCsp } from './csp'
import { handleCoverRequests } from './cover-protocol'
import { attachLogFile, captureConsole, logger } from './logger'
import { createLogFile } from './log-file'
import { Repository } from './db/repository'
import { createIntegrityService, createStashCheck } from './ipc/integrity'
import { applyPendingStash } from './library/stash-folder-service'
import { PileTitles } from './library/pile-titles'
import { watchCovers } from './library/cover-watch'
import { createTelemetry, scrubText, type Telemetry } from './telemetry'
import { telemetryBuildConfig } from './telemetry/build-config'
import { noteProcessGone, recentCrashLine, takeNewCrashes } from './telemetry/crash'
import { ProblemReporter } from './telemetry/problem-reporter'
import { TELEMETRY_EVENTS, sizeBucket } from '@shared/telemetry'
import { IPC_CHANNELS } from '@shared/ipc'
import { installAppMenu } from './menu'
import type { LaunchSteps } from './create-app'

function migrationsFolder(): string {
  return app.isPackaged ? join(process.resourcesPath, 'drizzle') : join(app.getAppPath(), 'drizzle')
}

/** The real launch work, on Electron and the app's modules. `createApp` runs it in order. */
export function launchSteps(opts: { devUrl: string | undefined }): LaunchSteps {
  const userData = (): string => app.getPath('userData')

  return {
    prepare(settings) {
      // The log file comes first so everything after it is kept. Every line is path-scrubbed on
      // the way in, console errors and warnings included.
      attachLogFile(createLogFile({ dir: join(userData(), 'logs'), scrub: scrubText }))
      captureConsole()
      // Dev gets its policy as a header (it must allow Vite's HMR); the packaged build carries it
      // as a meta tag in index.html, because headers are not reliable for file:// pages.
      if (opts.devUrl) applyCsp(session.defaultSession, { devUrl: opts.devUrl })
      handleCoverRequests(
        protocol,
        (fileUrl) => net.fetch(fileUrl),
        () => settings.getLibraryRoot()
      )
    },

    applyPendingStash,

    openLibrary(libraryRoot) {
      bootstrapLibrary(libraryRoot)
      const db = initDb(join(libraryRoot, 'designstash.db'))
      runMigrations(db, migrationsFolder())
      ensureSearchIndex(db)
      seedTaxonomy(db)
      try {
        // Only after an update or a migration: piles from before base titles get their base and
        // variations (design/specs/pile-titles.md), then the keyword index is written again.
        const repo = new Repository(db)
        const ran = runLaunchUpkeep(
          getSqlite(),
          {
            settlePileTitles: () => new PileTitles(repo).settleAll(),
            rebuildSearchIndex: () => repo.search.rebuildSearchIndex()
          },
          (err) => logger.error('Settling pile titles failed:', err)
        )
        if (ran) logger.info('Pile titles settled and search index rebuilt')
      } catch (err) {
        logger.error('Search index rebuild failed:', err)
      }
    },

    startServices(settings, libraryOpen) {
      if (libraryOpen) {
        const db = getDb()
        // Detection-only launch scan — never auto-resolves, never blocks startup.
        void (async () => {
          try {
            const integrity = createIntegrityService(new Repository(db), settings)
            const { lastRun } = await createStashCheck(settings, integrity).run('launch')
            logger.info(`integrity: launch check ${lastRun?.result}, ${lastRun?.toReview} to review`)
          } catch (err) {
            logger.error('Integrity launch scan failed:', err)
          }
        })()
        logger.info(`Database and library initialized at ${settings.getLibraryRoot()}`)
      }

      // Telemetry: NO-OP in dev/test and when consent is off or no key was baked into the build.
      // On by default for a new install; onboarding shows the switch. Nothing is sent until
      // onboarding is complete (spec §13.3a).
      const isTest = process.env.NODE_ENV === 'test'
      const isProd = app.isPackaged
      const { apiKey, host } = telemetryBuildConfig() // baked in at build time, absent in dev/CI -> Noop
      const buildTelemetry = (): Telemetry =>
        createTelemetry({
          enabled: settings.get().telemetryEnabled && settings.get().onboarded,
          isProd,
          isTest,
          installId: settings.get().telemetryInstallId,
          apiKey,
          host
        })
      let telemetry = buildTelemetry()
      const telemetryRef: TelemetryRef = {
        get: () => telemetry,
        rebuild: () => {
          const prev = telemetry
          telemetry = buildTelemetry()
          void prev.shutdown()
        }
      }

      // Problem reports go out whether or not usage data is on: the person presses Send after
      // seeing exactly what is sent. Same build-time key, same production-only rule.
      const crashState = join(userData(), 'crash-state.json')
      const reporter = new ProblemReporter({
        apiKey: isProd && !isTest ? apiKey : undefined,
        host,
        installId: settings.get().telemetryInstallId,
        queueFile: join(userData(), 'pending-reports.json')
      })
      void reporter.flushQueued().catch(() => {})

      // A renderer or helper process that died is noted, so the next launch can name the crash.
      app.on('render-process-gone', (_e, _wc, details) => {
        logger.error(`Renderer process gone: ${details.reason}`)
        if (details.reason !== 'clean-exit' && details.reason !== 'killed')
          noteProcessGone(crashState, 'renderer')
      })
      app.on('child-process-gone', (_e, details) => {
        logger.error(`${details.type} process gone: ${details.reason}`)
        if (details.reason !== 'clean-exit' && details.reason !== 'killed')
          noteProcessGone(crashState, details.type)
      })
      for (const crash of takeNewCrashes({
        dumpsDir: app.getPath('crashDumps'),
        stateFile: crashState
      })) {
        logger.error(`A crash from the last run was found (${crash.type})`)
        telemetry.track(TELEMETRY_EVENTS.APP_CRASHED, {
          process_type: crash.type,
          version: app.getVersion()
        })
      }

      telemetry.track(TELEMETRY_EVENTS.APP_OPENED, {
        version: app.getVersion(),
        library_size_bucket: libraryOpen
          ? sizeBucket(new Repository(getDb()).library.getLibraryStats().total)
          : 'unavailable'
      })

      return { telemetry: telemetryRef, reporter, crashLine: () => recentCrashLine(crashState) }
    },

    registerPreAppHandlers(settings, services, libraryOpen) {
      registerPreAppHandlers({
        settings,
        // Only an open library has counts for the problem report.
        repo: libraryOpen ? new Repository(getDb()) : null,
        ...(services
          ? {
              reporter: services.reporter,
              crashLine: services.crashLine,
              telemetry: services.telemetry
            }
          : {})
      })
    },

    registerLibraryHandlers(settings, services, getWindow) {
      const repo = new Repository(getDb())
      // A cover deleted outside the app (in Finder) shows as missing at the next list (F-012).
      watchCovers(settings.getLibraryRoot(), (path) => repo.library.forgetCoversUnder(path))
      registerAllHandlers(
        createHandlerContext({
          settings,
          telemetry: services.telemetry,
          repo,
          getWindow
        })
      )
    },

    installMenu(send, takePending) {
      installAppMenu({
        send,
        openExternal: (url) => void shell.openExternal(url),
        dev: !app.isPackaged
      })
      registerIpcHandler(IPC_CHANNELS.MENU_PENDING, takePending)
    },

    closeLibrary: closeDb
  }
}
