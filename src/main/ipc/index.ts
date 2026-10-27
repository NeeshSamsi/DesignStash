import { app } from 'electron'
import type { HandlerContext, TelemetryRef } from './context'
import { registerAppHandlers, registerRendererErrorHandler } from './app'
import { registerBootHandlers, type BootHandlerDeps } from './boot'
import { registerAboutHandlers } from './about'
import { registerSettingsHandlers } from './settings'
import { registerDialogHandlers } from './dialog'
import { registerImportHandlers } from './import'
import { registerAiHandlers } from './ai'
import { registerAiStatusHandlers } from './ai-status'
import { registerGroupingHandlers } from './grouping'
import { registerApprovalHandlers } from './approval'
import { registerTagHandlers } from './tags'
import { registerLibraryHandlers } from './library'
import { registerTrashHandlers } from './trash'
import { registerMockupHandlers } from './mockup'
import { registerPileHandlers } from './pile'
import { registerInboxHandlers } from './inbox'
import { registerIntegrityHandlers } from './integrity'
import { registerTelemetryHandlers } from './telemetry'
import { registerDebugHandlers } from './debug'
import { registerUndoHandlers } from './undo'

/**
 * The handlers the screens before the app rely on (app lifecycle, launch status, settings, folder
 * picker, problem report, renderer errors). Registered once at launch, library or not. Without
 * `telemetry` (it failed to start) renderer errors still reach the log.
 */
export function registerPreAppHandlers({
  telemetry,
  ...deps
}: BootHandlerDeps & { telemetry?: TelemetryRef }): void {
  registerAppHandlers()
  registerRendererErrorHandler(telemetry ?? null)
  registerBootHandlers(deps)
}

/**
 * Register every library-dependent domain's handlers. The app and boot handlers are registered at
 * launch by registerPreAppHandlers, so they exist whether or not the library opened. Debug
 * handlers are dev-only.
 */
export function registerAllHandlers(ctx: HandlerContext): void {
  registerAboutHandlers(ctx)
  registerSettingsHandlers(ctx)
  registerDialogHandlers()
  registerImportHandlers(ctx)
  registerAiHandlers(ctx)
  registerAiStatusHandlers(ctx)
  registerGroupingHandlers(ctx)
  registerApprovalHandlers(ctx)
  registerTagHandlers(ctx)
  registerLibraryHandlers(ctx)
  registerTrashHandlers(ctx)
  registerMockupHandlers(ctx)
  registerPileHandlers(ctx)
  registerInboxHandlers(ctx)
  registerIntegrityHandlers(ctx)
  registerUndoHandlers(ctx)
  registerTelemetryHandlers(ctx)
  if (!app.isPackaged) registerDebugHandlers(ctx.settings)
}
