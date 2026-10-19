import { app } from 'electron'
import type { HandlerContext } from './context'
import { registerAppHandlers } from './app'
import { registerSettingsHandlers } from './settings'
import { registerDialogHandlers } from './dialog'
import { registerImportHandlers } from './import'
import { registerAiHandlers } from './ai'
import { registerGroupingHandlers } from './grouping'
import { registerApprovalHandlers } from './approval'
import { registerTagHandlers } from './tags'
import { registerLibraryHandlers } from './library'
import { registerTrashHandlers } from './trash'
import { registerMockupHandlers } from './mockup'
import { registerIntegrityHandlers } from './integrity'
import { registerTelemetryHandlers } from './telemetry'
import { registerEntitlementsHandlers } from './entitlements'
import { registerDebugHandlers } from './debug'

/** Register every domain's handlers. Debug handlers are dev-only. */
export function registerAllHandlers(ctx: HandlerContext): void {
  registerAppHandlers()
  registerSettingsHandlers(ctx)
  registerDialogHandlers()
  registerImportHandlers(ctx)
  registerAiHandlers(ctx)
  registerGroupingHandlers(ctx)
  registerApprovalHandlers(ctx)
  registerTagHandlers(ctx)
  registerLibraryHandlers(ctx)
  registerTrashHandlers(ctx)
  registerMockupHandlers(ctx)
  registerIntegrityHandlers(ctx)
  registerTelemetryHandlers(ctx)
  registerEntitlementsHandlers()
  if (!app.isPackaged) registerDebugHandlers(ctx.settings)
}
