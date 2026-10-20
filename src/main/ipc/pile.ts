import { IPC_CHANNELS } from '@shared/ipc'
import { PileService } from '../library/pile-service'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

export function registerPileHandlers({ repo }: HandlerContext): void {
  const piles = new PileService(repo)

  registerIpcHandler(IPC_CHANNELS.PILE_CREATE, (args) => piles.create(args.memberIds, args.topId))
  registerIpcHandler(IPC_CHANNELS.PILE_ADD, (args) => piles.add(args.pileId, args.memberIds))
  registerIpcHandler(IPC_CHANNELS.PILE_MERGE, (args) => piles.merge(args.sourceIds, args.targetId))
  registerIpcHandler(IPC_CHANNELS.PILE_SET_TOP, (args) => piles.setTop(args.pileId, args.topId))
  registerIpcHandler(IPC_CHANNELS.PILE_DISBAND, (args) => piles.disband(args.pileId))
  registerIpcHandler(IPC_CHANNELS.PILE_RESTORE, (args) => piles.restore(args.snapshot))
}
