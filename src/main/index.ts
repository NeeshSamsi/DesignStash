import { app, shell, dialog, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { APP_ID } from '@shared/constants'
import { IPC_CHANNELS } from '@shared/ipc'
import { registerIpcHandler } from './ipc'
import { initDb, getDb, closeDb } from './db/connection'
import { runMigrations } from './db/migrate'
import { bootstrapLibrary, seedTaxonomy } from './db/bootstrap'
import { ensureSearchIndex } from './db/search-index'
import { tagCategories } from './db/schema'
import { createSettingsStore, type SettingsStore } from './settings'
import { logger } from './logger'
import { ImportService } from './import/import-service'
import { Repository } from './db/repository'
import { GroupingService } from './import/grouping-service'
import { ApprovalService } from './import/approval-service'
import type { GroupMember } from '@shared/grouping'
import type { InferenceProvider } from '@shared/inference'
import { detectHardware, recommendTier } from './ai/hardware'
import { MODEL_REGISTRY } from './ai/registry'
import { ModelDownloader } from './ai/download'
import { LocalInferenceProvider } from './ai/local-provider'
import { LibraryService } from './library/library-service'
import { IntegrityService } from './library/integrity-service'
import { EntitlementsService } from './entitlements/entitlements-service'
import { TagService } from './db/tag-service'
import { createTelemetry, type Telemetry } from './telemetry'
import { TELEMETRY_EVENTS } from '@shared/telemetry'

const rendererDevUrl = process.env['ELECTRON_RENDERER_URL']

/**
 * Mutable holder for the telemetry instance. Consent can flip at runtime, so
 * handlers read through `get()` and `rebuild()` swaps the instance via the factory
 * (which decides Noop vs PostHog). All callers stay no-op-safe when consent is off.
 */
interface TelemetryRef {
  get(): Telemetry
  rebuild(): void
}

// Module-scoped so the will-quit handler can flush telemetry on shutdown.
let telemetryRef: TelemetryRef | null = null

function migrationsFolder(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'drizzle')
    : join(app.getAppPath(), 'drizzle')
}

function registerHandlers(
  settings: SettingsStore,
  window: BrowserWindow,
  telemetry: TelemetryRef
): void {
  const repo = new Repository(getDb())
  const importService = new ImportService(repo, settings.getLibraryRoot())
  const activeImports = new Map<string, AbortController>()
  const modelsDir = join(settings.getLibraryRoot(), '..', 'models')
  const downloader = new ModelDownloader(modelsDir)
  const activeAiDownloads = new Map<string, AbortController>()

  let cachedProvider: { path: string; provider: LocalInferenceProvider } | null = null
  function getLocalProvider(modelPath: string): LocalInferenceProvider {
    if (cachedProvider?.path !== modelPath) {
      cachedProvider = { path: modelPath, provider: new LocalInferenceProvider(modelPath) }
    }
    return cachedProvider.provider
  }

  registerIpcHandler(IPC_CHANNELS.APP_INFO, () => ({
    name: 'DesignStash',
    version: app.getVersion(),
    env: process.env.NODE_ENV === 'development' ? 'development' : 'production'
  }))

  registerIpcHandler(IPC_CHANNELS.DB_PING, () => {
    const db = getDb()
    const row = db.select({ categories: sql<number>`count(*)` }).from(tagCategories).get()
    return {
      success: true,
      message: `pong — ${row?.categories ?? 0} tag categories seeded`,
      timestamp: Date.now()
    }
  })

  // Library location is a setting (default <userData>/Library); onboarding can override it.
  registerIpcHandler(IPC_CHANNELS.SETTINGS_GET, () => settings.get())

  registerIpcHandler(IPC_CHANNELS.SETTINGS_SET_LIBRARY_ROOT, (args) => {
    // Persists the choice. Relocating an existing library + re-init applies on next launch
    // (full move/restart handled when onboarding lands).
    const next = settings.update({ libraryRoot: args.path })
    return { libraryRoot: next.libraryRoot }
  })

  registerIpcHandler(IPC_CHANNELS.TELEMETRY_GET_CONSENT, () => ({
    enabled: settings.get().telemetryEnabled
  }))

  registerIpcHandler(IPC_CHANNELS.TELEMETRY_SET_CONSENT, (args) => {
    // Setting consent also marks onboarding complete (first-run disclosure, spec §13.3a) —
    // the smallest clean way to record the disclosure was shown without a separate channel.
    settings.update({ telemetryEnabled: args.enabled, onboarded: true })
    // Rebuild so toggling consent on/off takes effect immediately (Noop <-> PostHog).
    telemetry.rebuild()
    return { enabled: args.enabled }
  })

  // Fire-and-forget forward from the renderer. No-op-safe when consent is off.
  registerIpcHandler(IPC_CHANNELS.TELEMETRY_TRACK, (args) => {
    telemetry.get().track(args.event, args.props)
  })

  registerIpcHandler(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    const path = result.canceled ? null : (result.filePaths[0] ?? null)
    return { path }
  })

  registerIpcHandler(IPC_CHANNELS.DIALOG_SELECT_PSD_FILES, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PSD Files', extensions: ['psd'] }]
    })
    return { paths: result.filePaths }
  })

  registerIpcHandler(IPC_CHANNELS.IMPORT_START, async (args) => {
    const batchId = randomUUID()
    const controller = new AbortController()
    activeImports.set(batchId, controller)

    // Telemetry: counts only — NEVER paths or filenames.
    telemetry.get().track(TELEMETRY_EVENTS.IMPORT_STARTED, { paths: args.paths.length })
    const startedAt = Date.now()

    try {
      const summary = await importService.importPaths(args.paths, {
        batchId,
        signal: controller.signal,
        onProgress: (progress) => {
          window.webContents.send(IPC_CHANNELS.IMPORT_PROGRESS, progress)
        }
      })
      // Telemetry: counts + duration only — NEVER paths or filenames.
      telemetry.get().track(TELEMETRY_EVENTS.IMPORT_COMPLETED, {
        imported: summary.imported,
        duplicates: summary.duplicates,
        errors: summary.errors,
        durationMs: Date.now() - startedAt
      })
      return summary
    } finally {
      activeImports.delete(batchId)
    }
  })

  registerIpcHandler(IPC_CHANNELS.IMPORT_CANCEL, (args) => {
    const controller = activeImports.get(args.batchId)
    if (controller) {
      controller.abort()
      activeImports.delete(args.batchId)
      return { cancelled: true }
    }
    return { cancelled: false }
  })

  registerIpcHandler(IPC_CHANNELS.AI_HARDWARE_INFO, () => {
    const hw = detectHardware()
    return { ...hw, recommendedTier: recommendTier(hw) }
  })

  registerIpcHandler(IPC_CHANNELS.AI_LIST_MODELS, async () => {
    const activeModelId = settings.get().activeModelId
    const models = await Promise.all(
      MODEL_REGISTRY.map(async (entry) => ({
        id: entry.id,
        name: entry.name,
        tier: entry.tier,
        sizeBytes: entry.sizeBytes,
        installed: await downloader.isInstalled(entry.id),
        active: entry.id === activeModelId
      }))
    )
    return { models }
  })

  registerIpcHandler(IPC_CHANNELS.AI_DOWNLOAD_MODEL, (args) => {
    if (activeAiDownloads.has(args.id)) return { started: false }
    const controller = new AbortController()
    activeAiDownloads.set(args.id, controller)
    void downloader
      .download(args.id, {
        signal: controller.signal,
        onProgress: (p) => {
          window.webContents.send(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, p)
        }
      })
      .then(() => {
        window.webContents.send(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, {
          modelId: args.id,
          receivedBytes: 0,
          totalBytes: 0,
          phase: 'done'
        })
      })
      .catch((err: unknown) => {
        const isAbort = err instanceof Error && err.name === 'AbortError'
        if (!isAbort) {
          window.webContents.send(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, {
            modelId: args.id,
            receivedBytes: 0,
            totalBytes: 0,
            phase: 'error',
            error: err instanceof Error ? err.message : String(err)
          })
        }
      })
      .finally(() => {
        activeAiDownloads.delete(args.id)
      })
    return { started: true }
  })

  registerIpcHandler(IPC_CHANNELS.AI_CANCEL_DOWNLOAD, (args) => {
    const controller = activeAiDownloads.get(args.id)
    if (controller) {
      controller.abort()
      activeAiDownloads.delete(args.id)
      return { cancelled: true }
    }
    return { cancelled: false }
  })

  registerIpcHandler(IPC_CHANNELS.AI_GET_ACTIVE, () => ({
    modelId: settings.get().activeModelId
  }))

  registerIpcHandler(IPC_CHANNELS.AI_SET_ACTIVE, (args) => {
    settings.update({ activeModelId: args.id })
    // Telemetry: hardware/model tier enum only — never the model id beyond its tier.
    if (args.id) {
      const tier = MODEL_REGISTRY.find((m) => m.id === args.id)?.tier
      if (tier) telemetry.get().track(TELEMETRY_EVENTS.MODEL_TIER_CHOSEN, { tier })
    }
    return { modelId: args.id }
  })

  registerIpcHandler(IPC_CHANNELS.GROUPING_PROPOSE, (args) => {
    const dbMockups = repo.getMockupsByBatchId(args.batchId)
    const members: GroupMember[] = dbMockups.map((m) => {
      const ctx = m.importContext as { batchId?: string; folderTrail?: string[]; originalFilename?: string } | null
      return {
        mockupId: m.id,
        fileName: ctx?.originalFilename ?? m.title,
        folderTrail: ctx?.folderTrail ?? [],
        coverPath: m.coverPath,
        isPrimary: false
      }
    })
    return GroupingService.propose(args.batchId, members)
  })

  registerIpcHandler(IPC_CHANNELS.GROUPING_CONFIRM, (args) => {
    repo.confirmGroupings(args.groups, args.singletonIds)
    // Telemetry: counts only — never group contents.
    telemetry.get().track(TELEMETRY_EVENTS.GROUP_CONFIRMED, {
      groups: args.groups.length,
      singletons: args.singletonIds.length
    })
    return { confirmed: true }
  })

  registerIpcHandler(IPC_CHANNELS.APPROVAL_INIT, async (args) => {
    const activeModelId = settings.get().activeModelId
    let provider: InferenceProvider | null = null
    if (activeModelId) {
      const installed = await downloader.isInstalled(activeModelId)
      if (installed) {
        const modelPath = join(modelsDir, activeModelId, 'model.gguf')
        provider = getLocalProvider(modelPath)
      }
    }
    const service = new ApprovalService(repo, provider, new TagService(repo))
    return service.initQueue(args.batchId)
  })

  registerIpcHandler(IPC_CHANNELS.APPROVAL_SAVE_ITEM, async (args) => {
    repo.approveItem(args.mockupId, {
      title: args.title,
      description: args.description,
      coverPath: args.coverPath,
      coverSource: args.coverSource,
      reviewStatus: 'approved'
    })
    repo.clearTagsForMockup(args.mockupId)
    for (const tagId of args.tagIds) {
      repo.addTagToMockup(args.mockupId, tagId)
    }
    repo.upsertSearchIndex(args.mockupId)

    let reinferredItems = undefined
    if (args.isLeader && args.wasEdited && args.leaderId === null) {
      const groupMembers = repo.getMockupsByGroupId(args.mockupId)
      if (groupMembers.length > 0) {
        const activeModelId = settings.get().activeModelId
        let provider: InferenceProvider | null = null
        if (activeModelId) {
          const installed = await downloader.isInstalled(activeModelId)
          if (installed) {
            provider = getLocalProvider(join(modelsDir, activeModelId, 'model.gguf'))
          }
        }
        const service = new ApprovalService(repo, provider, new TagService(repo))
        const memberItems = await service.initQueue_membersOnly(groupMembers)
        reinferredItems = await service.reinferGroupRemainder(memberItems, args)
      }
    }

    // Telemetry: booleans only — never title/description/tag text or filenames.
    telemetry.get().track(TELEMETRY_EVENTS.AI_ITEM_APPROVED, {
      wasEdited: args.wasEdited,
      isLeader: args.isLeader
    })

    return { saved: true, reinferredItems }
  })

  registerIpcHandler(IPC_CHANNELS.APPROVAL_SET_COVER, async (args) => {
    const mockup = repo.getMockup(args.mockupId)
    if (!mockup) throw new Error(`Mockup ${args.mockupId} not found`)

    const coversDir = join(settings.getLibraryRoot(), 'covers')
    await fs.mkdir(coversDir, { recursive: true })
    const ext = args.filePath.split('.').pop() ?? 'png'
    const destFileName = `${args.mockupId}-user.${ext}`
    const destPath = join(coversDir, destFileName)
    await fs.copyFile(args.filePath, destPath)

    repo.setMockupCover(args.mockupId, destPath, 'user-uploaded')
    return { coverPath: destPath, coverSource: 'user-uploaded' as const }
  })

  registerIpcHandler(IPC_CHANNELS.TAG_LIST_BY_CATEGORY, () => {
    const allCategories = repo.getAllCategories()
    const allTags = repo.getAllTags()
    const categories = allCategories.map((cat) => ({
      categoryId: cat.id,
      categoryLabel: cat.label,
      tags: allTags
        .filter((t) => t.categoryId === cat.id)
        .map((t) => ({ tagId: t.id, label: t.label }))
    }))
    return { categories }
  })

  registerIpcHandler(IPC_CHANNELS.TAG_CREATE, (args) => {
    const tag = repo.createTag({ label: args.label, categoryId: args.categoryId })
    return { tagId: tag.id, label: tag.label, categoryId: tag.categoryId }
  })

  registerIpcHandler(IPC_CHANNELS.TAG_TREE, () => ({ tree: repo.getTagTree() }))

  registerIpcHandler(IPC_CHANNELS.TAG_RENAME, (args) => {
    repo.renameTag(args.tagId, args.label)
    return { ok: true }
  })

  registerIpcHandler(IPC_CHANNELS.TAG_MERGE, (args) =>
    repo.mergeTags(args.sourceTagId, args.targetTagId)
  )

  const tagService = new TagService(repo)

  registerIpcHandler(IPC_CHANNELS.TAG_MERGE_PREVIEW, tagService.previewMergeTags)

  registerIpcHandler(IPC_CHANNELS.TAG_DELETE, tagService.deleteTag)

  registerIpcHandler(IPC_CHANNELS.TAG_RESTORE, tagService.restoreTag)

  registerIpcHandler(IPC_CHANNELS.TAG_FIND, tagService.findTag)

  registerIpcHandler(IPC_CHANNELS.TAG_SET_CATEGORY, (args) => {
    repo.reassignTagCategory(args.tagId, args.categoryId)
    return { ok: true }
  })

  registerIpcHandler(IPC_CHANNELS.CATEGORY_CREATE, (args) => {
    const cat = repo.createCategory({ label: args.label })
    return { categoryId: cat.id, label: cat.label }
  })

  registerIpcHandler(IPC_CHANNELS.CATEGORY_RENAME, (args) => {
    repo.renameCategory(args.categoryId, args.label)
    return { ok: true }
  })

  registerIpcHandler(IPC_CHANNELS.CATEGORY_DELETE, tagService.deleteCategory)

  registerIpcHandler(IPC_CHANNELS.CATEGORY_RESTORE, tagService.restoreCategory)

  const libraryService = new LibraryService(repo, settings.getLibraryRoot(), {
    openPath: (p) => shell.openPath(p)
  })

  registerIpcHandler(IPC_CHANNELS.LIBRARY_LIST, (args) => {
    // Telemetry: presence + filter counts only — NEVER the search query text.
    if (args.query && args.query.trim().length > 0) {
      telemetry.get().track(TELEMETRY_EVENTS.SEARCH_PERFORMED, {
        hasQuery: true,
        tagFilter: (args.tagIds?.length ?? 0) + (args.categoryIds?.length ?? 0)
      })
    }
    return {
      items: repo.getLibrary({
        ...(args.tagIds !== undefined && { tagIds: args.tagIds }),
        ...(args.categoryIds !== undefined && { categoryIds: args.categoryIds }),
        ...(args.query !== undefined && { query: args.query }),
        sort: args.sort
      })
    }
  })

  registerIpcHandler(IPC_CHANNELS.LIBRARY_STATS, () => repo.getLibraryStats())

  registerIpcHandler(IPC_CHANNELS.LIBRARY_TRASH_LIST, () => ({
    items: repo.getTrash()
  }))

  registerIpcHandler(IPC_CHANNELS.MOCKUP_DETAIL, (args) => {
    const detail = repo.getMockupDetail(args.mockupId)
    if (!detail.mockup) throw new Error(`Mockup ${args.mockupId} not found`)
    return {
      item: {
        id: detail.mockup.id,
        title: detail.mockup.title,
        description: detail.mockup.description ?? null,
        coverPath: detail.mockup.coverPath,
        isGroup: detail.mockup.isGroup,
        favourite: detail.mockup.favourite,
        reviewStatus: detail.mockup.reviewStatus,
        variantCount: detail.variants.length,
        tags: detail.tags
      },
      variants: detail.variants.map((v) => ({ id: v.id, title: v.title, coverPath: v.coverPath }))
    }
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_SET_FAVOURITE, (args) => {
    repo.setFavourite(args.mockupId, args.favourite)
    return { favourite: args.favourite }
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_UPDATE, (args) => {
    repo.updateMockupMeta(args.mockupId, {
      title: args.title,
      description: args.description,
      tagIds: args.tagIds
    })
    return { updated: true }
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL, async (args) =>
    libraryService.openExternal(args.mockupId)
  )

  registerIpcHandler(IPC_CHANNELS.MOCKUP_TRASH, (args) => {
    repo.moveToTrash(args.mockupId)
    return { ok: true }
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_RESTORE, (args) => {
    repo.restore(args.mockupId)
    return { ok: true }
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_DELETE_PERMANENT, async (args) =>
    libraryService.deletePermanently(args.mockupId)
  )

  registerIpcHandler(IPC_CHANNELS.MOCKUP_DUPLICATE, async (args) =>
    libraryService.duplicate(args.mockupId)
  )

  registerIpcHandler(IPC_CHANNELS.GROUP_UNGROUP, (args) => {
    repo.ungroupGroup(args.leaderId)
    return { ungrouped: true }
  })

  registerIpcHandler(IPC_CHANNELS.GROUP_DELETE, async (args) => {
    const result = await libraryService.deleteGroup(args.leaderId)
    return { deleted: result.deleted }
  })

  const integrityService = new IntegrityService(repo, settings.getLibraryRoot())

  registerIpcHandler(IPC_CHANNELS.INTEGRITY_SCAN, () => integrityService.scan())

  registerIpcHandler(IPC_CHANNELS.INTEGRITY_ADD_ORPHAN, (args) =>
    integrityService.addOrphanFile(args.filePath)
  )

  registerIpcHandler(IPC_CHANNELS.INTEGRITY_DELETE_RECORD, (args) => {
    integrityService.deleteOrphanRecord(args.mockupId)
    return { deleted: true }
  })

  // Phase 1: defaults → free tier, all-free registry → everything unlocked.
  // Tier source becomes license-backed in a later phase.
  const entitlements = new EntitlementsService()
  registerIpcHandler(IPC_CHANNELS.ENTITLEMENTS_SNAPSHOT, () => entitlements.snapshot())
}

function registerDebugHandlers(settings: SettingsStore): void {
  registerIpcHandler(IPC_CHANNELS.DEBUG_READ_SETTINGS, async () => {
    const settingsPath = join(app.getPath('userData'), 'settings.json')
    try {
      const text = await fs.readFile(settingsPath, 'utf-8')
      return { path: settingsPath, json: text, exists: true }
    } catch {
      return { path: settingsPath, json: '{}', exists: false }
    }
  })

  registerIpcHandler(IPC_CHANNELS.DEBUG_RESET_APP, async () => {
    closeDb()
    const userData = app.getPath('userData')
    const home = app.getPath('home')
    const libraryRoot = settings.getLibraryRoot()
    const modelsDir = join(libraryRoot, '..', 'models')

    for (const p of [userData, libraryRoot]) {
      if (!p || p === home || p === '/' || p.split('/').filter(Boolean).length < 2) {
        throw new Error(`refusing unsafe path: ${p}`)
      }
    }

    const ARTIFACTS = ['designstash.db', 'designstash.db-shm', 'designstash.db-wal', 'config.json', 'mockups', 'models']
    await Promise.all([
      ...ARTIFACTS.map((a) => fs.rm(join(libraryRoot, a), { recursive: true, force: true })),
      fs.rm(modelsDir, { recursive: true, force: true }),
      fs.rm(join(userData, 'settings.json'), { recursive: true, force: true }),
      fs.rm(join(userData, 'Library'), { recursive: true, force: true }),
      fs.rm(join(userData, 'models'), { recursive: true, force: true }),
    ])

    app.relaunch()
    app.exit(0)
    return { ok: true }
  })
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.on('ready-to-show', () => window.show())

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (rendererDevUrl) {
    void window.loadURL(rendererDevUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}

app.whenReady().then(() => {
  app.setAppUserModelId(APP_ID)

  const settings = createSettingsStore(app.getPath('userData'))

  try {
    logger.info('Initializing application data…')
    const libraryRoot = settings.getLibraryRoot()
    bootstrapLibrary(libraryRoot)
    const db = initDb(join(libraryRoot, 'designstash.db'))
    runMigrations(db, migrationsFolder())
    ensureSearchIndex(db)
    seedTaxonomy(db)
    try {
      new Repository(db).rebuildSearchIndex()
    } catch (err) {
      logger.error('Search index rebuild failed:', err)
    }
    // Detection-only launch scan — never auto-resolves, never blocks startup.
    void (async () => {
      try {
        const report = await new IntegrityService(new Repository(db), libraryRoot).scan()
        logger.info(
          `integrity: ${report.orphanFiles.length} orphan files, ${report.orphanRecords.length} orphan records`
        )
      } catch (err) {
        logger.error('Integrity launch scan failed:', err)
      }
    })()
    logger.info(`Database and library initialized at ${libraryRoot}`)
  } catch (err) {
    logger.error('Failed to initialize database/library:', err)
  }

  // Telemetry: NO-OP in dev/test and when consent is off or no key is set.
  // Nothing is sent until onboarding is complete (spec §13.3a).
  const isTest = process.env.NODE_ENV === 'test'
  const isProd = app.isPackaged
  const apiKey = process.env.POSTHOG_KEY // absent in dev/CI -> Noop
  const buildTelemetry = (): Telemetry =>
    createTelemetry({
      enabled: settings.get().telemetryEnabled && settings.get().onboarded,
      isProd,
      isTest,
      installId: settings.get().telemetryInstallId,
      apiKey
    })
  let telemetry = buildTelemetry()
  telemetryRef = {
    get: () => telemetry,
    rebuild: () => {
      const prev = telemetry
      telemetry = buildTelemetry()
      void prev.shutdown()
    }
  }

  // Crash capture — captureError scrubs absolute paths before any dispatch.
  process.on('uncaughtException', (err) => telemetry.captureError(err))
  process.on('unhandledRejection', (reason) => telemetry.captureError(reason))

  const window = createWindow()
  registerHandlers(settings, window, telemetryRef)
  if (!app.isPackaged) registerDebugHandlers(settings)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  logger.info('Closing database connection…')
  void telemetryRef?.get().shutdown()
  closeDb()
})
