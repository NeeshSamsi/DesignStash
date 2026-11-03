import { create } from 'zustand'
import type { AiStatusEvent } from '@shared/ipc/ai-status'
import type { InboxItem, InboxStage, TrashItem, TrashStats } from '@shared/inbox'
import type { AiTotals } from '@renderer/lib/inbox-list'

interface InboxState {
  toSort: InboxItem[] | null
  toStash: InboxItem[] | null
  trash: TrashItem[] | null
  trashStats: TrashStats | null
  /** The last ai:status totals. */
  aiTotals: AiTotals | null
  /** The last fetch of that list failed. */
  failed: Record<'toSort' | 'toStash' | 'trash', boolean>
  setFailed(list: 'toSort' | 'toStash' | 'trash', failed: boolean): void
  setList(stage: InboxStage, items: InboxItem[]): void
  setTrash(items: TrashItem[]): void
  setTrashStats(stats: TrashStats): void
  applyAiStatus(event: AiStatusEvent): void
  reset(): void
}

const empty = {
  toSort: null,
  toStash: null,
  trash: null,
  trashStats: null,
  aiTotals: null,
  failed: { toSort: false, toStash: false, trash: false }
}

/** The inbox pages' lists. `null` means not fetched yet, which the grid shows as loading. */
export const useInboxStore = create<InboxState>((set) => ({
  ...empty,
  setFailed: (list, failed) => set((state) => ({ failed: { ...state.failed, [list]: failed } })),
  setList: (stage, items) => set(stage === 'to_sort' ? { toSort: items } : { toStash: items }),
  setTrash: (trash) => set({ trash }),
  setTrashStats: (trashStats) => set({ trashStats }),
  applyAiStatus: (event) =>
    set((state) => {
      const status = new Map(event.updates.map((u) => [u.mockupId, u.status]))
      return {
        aiTotals: event.totals,
        toSort:
          state.toSort?.map((item) =>
            status.has(item.id) ? { ...item, aiStatus: status.get(item.id)! } : item
          ) ?? null
      }
    }),
  reset: () => set(empty)
}))
