import { IPC_CHANNELS } from '@shared/ipc'
import { TELEMETRY_EVENTS } from '@shared/telemetry'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

export function registerLibraryHandlers({ telemetry, repo }: HandlerContext): void {
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
}
