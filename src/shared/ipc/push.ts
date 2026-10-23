import type { z } from 'zod'
import { IPC_CHANNELS, type PushChannel } from '../ipc-channels'
import { LookOverItemSchema } from '../approval'
import { InboxCountsSchema } from '../inbox'
import { StashMoveProgressSchema } from '../stash'
import { AiDownloadProgressSchema } from './ai'
import { AiStatusEventSchema } from './ai-status'
import { CopyProgressSchema } from './import'
import { MenuCommandSchema } from './menu'

/**
 * Main → renderer push events, each with its payload schema. They have no request or response
 * and no invoke handler: the main process sends them with `ctx.push`, the renderer listens with
 * `subscribePush`, and the preload relays only the channels listed in PUSH_CHANNELS.
 */
export const PUSH_CONTRACT = {
  [IPC_CHANNELS.AI_DOWNLOAD_PROGRESS]: { payload: AiDownloadProgressSchema },
  [IPC_CHANNELS.AI_STATUS]: { payload: AiStatusEventSchema },
  [IPC_CHANNELS.STASH_MOVE_PROGRESS]: { payload: StashMoveProgressSchema },
  [IPC_CHANNELS.COPY_PROGRESS]: { payload: CopyProgressSchema },
  [IPC_CHANNELS.INBOX_COUNTS_CHANGED]: { payload: InboxCountsSchema },
  [IPC_CHANNELS.MENU_COMMAND]: { payload: MenuCommandSchema },
  /** A Look it over draft a late AI suggestion filled in (`LookOverService.settle`). */
  [IPC_CHANNELS.LOOK_OVER_DRAFT]: { payload: LookOverItemSchema }
} as const satisfies { [C in PushChannel]: { payload: z.ZodType } }
