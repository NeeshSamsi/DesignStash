import { vi } from 'vitest'
import { IPC_CHANNELS } from '@shared/ipc'
import type { LibraryItem, LibraryQuery } from '@shared/library'
import { useLibraryStore } from '@renderer/stores/libraryStore'
import { useTagTreeStore } from '@renderer/stores/tagTreeStore'
import { useDetailsStore } from '@renderer/stores/detailsStore'
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
  favourite: false,
  createdAt: `2026-10-${String(10 + id).padStart(2, '0')}`,
  pile: null,
  tags: [],
  pileId: null,
  variation: null,
  ...over
})

export const pile = (id: number, variants = 2, over: Partial<LibraryItem> = {}) =>
  item(id, { pile: { memberCount: variants + 1 }, pileId: id, ...over })

type Handler = (request: unknown) => unknown

export interface Api {
  invoke: ReturnType<typeof vi.fn>
  /** Every request sent on a channel, in order. */
  calls: (channel: string) => unknown[]
  /** Pushes a main → window event to whatever listens for it. */
  push: (channel: string, payload: unknown) => void
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
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  window.api = {
    appName: 'DesignStash',
    invoke,
    subscribe: vi.fn((channel: string, fn: (payload: unknown) => void) => {
      const set = listeners.get(channel) ?? new Set()
      set.add(fn)
      listeners.set(channel, set)
      return () => set.delete(fn)
    }),
    getPathForFile: vi.fn()
  } as unknown as typeof window.api
  return {
    invoke,
    calls: (channel) => invoke.mock.calls.filter(([c]) => c === channel).map(([, r]) => r),
    push: (channel, payload) => listeners.get(channel)?.forEach((fn) => fn(payload))
  }
}

export function resetStores() {
  useLibraryStore.getState().reset()
  useTagTreeStore.getState().reset()
  useUiStore.setState({ view: 'all', modal: null })
  useDetailsStore.getState().closePile()
  useDetailsStore.getState().syncTarget(null)
  useDetailsStore.getState().keepEditing()
  useDetailsStore.getState().setDirty(false)
}

/** Mounts the shortcut dispatcher the way AppShell does, so ⌘G, ⌫ and friends reach the registry. */
export function ShortcutHost({ children }: { children: ReactNode }) {
  useShortcutDispatcher()
  return <>{children}</>
}
