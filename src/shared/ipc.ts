import type { z } from 'zod'
import {
  IPC_CHANNELS,
  PUSH_CHANNELS,
  isPushChannel,
  type InvokeChannel,
  type IpcChannel,
  type PushChannel
} from './ipc-channels'
import { appContract } from './ipc/app'
import { bootContract } from './ipc/boot'
import { settingsContract } from './ipc/settings'
import { dialogContract } from './ipc/dialog'
import { importContract } from './ipc/import'
import { aiContract } from './ipc/ai'
import { groupingContract } from './ipc/grouping'
import { approvalContract } from './ipc/approval'
import { tagsContract } from './ipc/tags'
import { libraryContract } from './ipc/library'
import { trashContract } from './ipc/trash'
import { mockupContract } from './ipc/mockup'
import { pileContract } from './ipc/pile'
import { inboxContract } from './ipc/inbox'
import { integrityContract } from './ipc/integrity'
import { telemetryContract } from './ipc/telemetry'
import { entitlementsContract } from './ipc/entitlements'
import { debugContract } from './ipc/debug'
import { PUSH_CONTRACT } from './ipc/push'

export {
  IPC_CHANNELS,
  PUSH_CHANNELS,
  PUSH_CONTRACT,
  isPushChannel,
  type InvokeChannel,
  type IpcChannel,
  type PushChannel
}
export {
  AiModelTierSchema,
  AiModelInfoSchema,
  AiDownloadProgressSchema,
  type AiModelTier,
  type AiModelInfo,
  type AiDownloadProgress
} from './ipc/ai'

/**
 * Domain contracts, one file per domain in ./ipc/. Each maps a channel to its request/response
 * zod schemas (validated on both ends). Every invoke channel appears in exactly one domain;
 * push channels are in PUSH_CONTRACT.
 */
export const IPC_DOMAIN_CONTRACTS = {
  app: appContract,
  boot: bootContract,
  settings: settingsContract,
  dialog: dialogContract,
  import: importContract,
  ai: aiContract,
  grouping: groupingContract,
  approval: approvalContract,
  tags: tagsContract,
  library: libraryContract,
  trash: trashContract,
  mockup: mockupContract,
  pile: pileContract,
  inbox: inboxContract,
  integrity: integrityContract,
  telemetry: telemetryContract,
  entitlements: entitlementsContract,
  debug: debugContract
} as const

/** Every invoke channel's request/response schemas. */
export const IPC_CONTRACT = {
  ...appContract,
  ...bootContract,
  ...settingsContract,
  ...dialogContract,
  ...importContract,
  ...aiContract,
  ...groupingContract,
  ...approvalContract,
  ...tagsContract,
  ...libraryContract,
  ...trashContract,
  ...mockupContract,
  ...pileContract,
  ...inboxContract,
  ...integrityContract,
  ...telemetryContract,
  ...entitlementsContract,
  ...debugContract
} as const

export type IpcRequest<C extends InvokeChannel> = z.infer<(typeof IPC_CONTRACT)[C]['request']>
export type IpcResponse<C extends InvokeChannel> = z.infer<(typeof IPC_CONTRACT)[C]['response']>

/** A push channel's payload (its PUSH_CONTRACT schema). */
export type PushPayload<C extends PushChannel> = z.infer<(typeof PUSH_CONTRACT)[C]['payload']>

/** Standard wrapper so the renderer always gets a typed success/error result. */
export type IpcResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } }
