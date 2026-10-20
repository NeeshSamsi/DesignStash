import { useEffect, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { InboxCounts } from '@shared/inbox'
import { subscribePush } from '@renderer/lib/subscribe'

/** To sort, To stash and Trash counts: fetched once, then pushed by main as they change. */
export function useInboxCounts(): InboxCounts | null {
  const [counts, setCounts] = useState<InboxCounts | null>(null)
  useEffect(() => {
    let live = true
    void window.api.invoke(IPC_CHANNELS.INBOX_COUNTS, undefined).then((res) => {
      if (live && res.success) setCounts((current) => current ?? res.data)
    })
    const off = subscribePush(IPC_CHANNELS.INBOX_COUNTS_CHANGED, setCounts)
    return () => {
      live = false
      off()
    }
  }, [])
  return counts
}
