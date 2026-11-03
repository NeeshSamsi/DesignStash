import { IPC_CHANNELS } from '@shared/ipc'
import { EntitlementsService } from '../entitlements/entitlements-service'
import { registerIpcHandler } from './register'

export function registerEntitlementsHandlers(): void {
  // Phase 1: defaults → free tier, all-free registry → everything unlocked.
  // Tier source becomes license-backed in a later phase.
  const entitlements = new EntitlementsService()
  registerIpcHandler(IPC_CHANNELS.ENTITLEMENTS_SNAPSHOT, () => entitlements.snapshot())
}
