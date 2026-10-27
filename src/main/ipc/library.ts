import { IPC_CHANNELS } from '@shared/ipc'
import { TELEMETRY_EVENTS, sizeBucket } from '@shared/telemetry'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'
import { MEANING_MIN_QUERY_CHARS, MEANING_WAIT_MS } from '../search/meaning'

export function registerLibraryHandlers({ telemetry, repo, ai }: HandlerContext): void {
  registerIpcHandler(IPC_CHANNELS.LIBRARY_LIST, async (args) => {
    const query = args.query?.trim() ?? ''
    // A search being typed starts the meaning model, so it is up when the search gets long enough.
    if (query.length > 0 && query.length < MEANING_MIN_QUERY_CHARS) ai.embeddings.warm()
    // Meaning search: how close each mockup is to the search. Null (no model, no vectors, a
    // failure, or slower than MEANING_WAIT_MS) leaves keyword results, as before.
    const meaning =
      query.length >= MEANING_MIN_QUERY_CHARS ? await ai.embeddings.similarities(query, { within: MEANING_WAIT_MS }) : null
    const { rows: items, meaningHit } = repo.library.queryLibrary({
      meaning,
      ...(args.tagIds !== undefined && { tagIds: args.tagIds }),
      ...(args.categoryIds !== undefined && { categoryIds: args.categoryIds }),
      ...(args.query !== undefined && { query: args.query }),
      ...(args.starredOnly !== undefined && { starredOnly: args.starredOnly }),
      sort: args.sort
    })
    // Telemetry: presence, filter counts and how many results came back, as a range. NEVER the
    // search query text.
    if (args.query && args.query.trim().length > 0) {
      telemetry.get().track(TELEMETRY_EVENTS.SEARCH_PERFORMED, {
        hasQuery: true,
        tagFilter: (args.tagIds?.length ?? 0) + (args.categoryIds?.length ?? 0),
        results_bucket: sizeBucket(items.length),
        had_results: items.length > 0,
        meaning_hit: meaningHit
      })
    }
    return { items }
  })

  registerIpcHandler(IPC_CHANNELS.LIBRARY_STATS, () => repo.library.getLibraryStats())
}
