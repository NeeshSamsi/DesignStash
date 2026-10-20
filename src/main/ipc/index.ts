import { app } from 'electron'
import type { HandlerContext } from './context'
import { registerAppHandlers } from './app'
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
import { registerEntitlementsHandlers } from './entitlements'
import { registerDebugHandlers } from './debug'

/** Register every domain's handlers. Debug handlers are dev-only. */
export function registerAllHandlers(ctx: HandlerContext): void {
  registerAppHandlers()
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
  registerTelemetryHandlers(ctx)
  registerEntitlementsHandlers()
  if (!app.isPackaged) registerDebugHandlers(ctx.settings)
}
