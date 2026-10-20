import { vi } from 'vitest'
import { IPC_CHANNELS } from '@shared/ipc'
import type { LibraryItem, LibraryQuery } from '@shared/library'
import { useLibraryStore } from '@renderer/stores/libraryStore'
import { useUiStore } from '@renderer/stores/uiStore'
import { useShortcutDispatcher } from '@renderer/lib/shortcuts'
import type { ReactNode } from 'react'

/** Test helpers for the My Stash page: fixtures, a routable `window.api`, a shortcut host. */

export const item = (id: number, over: Partial<LibraryItem> = {}): LibraryItem => ({
  id,
  title: `Mockup ${id}`,
  description: null,
  coverPath: `/stash/${id}.webp`,
  coverSource: 'embedded',
  coverMissing: false,
  isGroup: false,
  favourite: false,
  reviewStatus: 'approved',
  createdAt: `2026-10-${String(10 + id).padStart(2, '0')}`,
  variantCount: 0,
  topId: null,
  tags: [],
  ...over
})

export const pile = (id: number, variants = 2, over: Partial<LibraryItem> = {}) =>
  item(id, { isGroup: true, variantCount: variants, topId: id, ...over })

type Handler = (request: unknown) => unknown

export interface Api {
  invoke: ReturnType<typeof vi.fn>
  /** Every request sent on a channel, in order. */
  calls: (channel: string) => unknown[]
}

/** `window.api.invoke` answering from `handlers`; unlisted channels succeed with `{}`. */
export function setupApi(
  items: LibraryItem[],
  handlers: Record<string, Handler> = {},
  stats = {
    total: items.length,
    favourites: items.filter((i) => i.favourite).length,
    groups: 0,
    trashed: 0
  }
): Api {
  const invoke = vi.fn(async (channel: string, request: unknown) => {
    const handler = handlers[channel]
    if (handler) return handler(request)
    if (channel === IPC_CHANNELS.LIBRARY_LIST) {
      const query = request as LibraryQuery
      const list = query.starredOnly ? items.filter((i) => i.favourite) : items
      return { success: true, data: { items: list } }
    }
    if (channel === IPC_CHANNELS.LIBRARY_STATS) return { success: true, data: stats }
    if (channel === IPC_CHANNELS.TAG_TREE) return { success: true, data: { tree: [] } }
    return { success: true, data: {} }
  })
  window.api = {
    appName: 'DesignStash',
    invoke,
    onImportProgress: vi.fn(() => () => {}),
    onAiDownloadProgress: vi.fn(() => () => {}),
    getPathForFile: vi.fn()
  } as unknown as typeof window.api
  return {
    invoke,
    calls: (channel) => invoke.mock.calls.filter(([c]) => c === channel).map(([, r]) => r)
  }
}

export function resetStores() {
  useLibraryStore.getState().reset()
  useUiStore.setState({ view: 'all', modal: null })
}

/** Mounts the shortcut dispatcher the way AppShell does, so ⌘G, ⌫ and friends reach the registry. */
export function ShortcutHost({ children }: { children: ReactNode }) {
  useShortcutDispatcher()
  return <>{children}</>
}
