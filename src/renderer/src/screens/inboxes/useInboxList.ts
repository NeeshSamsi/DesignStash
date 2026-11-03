import { useCallback, useEffect } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { InboxItem, InboxStage } from '@shared/inbox'
import { subscribePush } from '@renderer/lib/subscribe'
import { useInboxStore } from '@renderer/stores/inboxStore'

export interface InboxList {
  /** `null` until the first answer. */
  items: InboxItem[] | null
  failed: boolean
  refresh: () => Promise<void>
}

/**
 * One inbox's cards. Fetches on mount, again whenever main says the counts changed (a toss, a
 * stash, an import), and applies ai:status updates to the cards as they arrive.
 */
export function useInboxList(stage: InboxStage): InboxList {
  const items = useInboxStore((s) => (stage === 'to_sort' ? s.toSort : s.toStash))
  const setList = useInboxStore((s) => s.setList)
  const key = stage === 'to_sort' ? 'toSort' : 'toStash'
  const failed = useInboxStore((s) => s.failed[key])
  const setFailed = useInboxStore((s) => s.setFailed)

  const refresh = useCallback(async () => {
    const res = await window.api.invoke(IPC_CHANNELS.INBOX_LIST, { stage })
    if (res.success) {
      setList(stage, res.data.items)
      setFailed(key, false)
    } else {
      setFailed(key, true)
    }
  }, [stage, key, setList, setFailed])

  useEffect(() => {
    void refresh()
    const offCounts = subscribePush(IPC_CHANNELS.INBOX_COUNTS_CHANGED, () => void refresh())
    const offAi =
      stage === 'to_sort'
        ? subscribePush(IPC_CHANNELS.AI_STATUS, (event) =>
            useInboxStore.getState().applyAiStatus(event)
          )
        : () => {}
    return () => {
      offCounts()
      offAi()
    }
  }, [stage, refresh])

  return { items, failed, refresh }
}
