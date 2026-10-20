import { useCallback, useEffect } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { subscribePush } from '@renderer/lib/subscribe'
import { useCopyStore } from '@renderer/stores/copyStore'
import { toast } from '@renderer/stores/toastStore'
import { undoneMessage } from './gather-model'

const FAILED = { variant: 'error', message: 'Couldn’t start copying. Try again.' } as const

/**
 * Copying into the stash. Every way in (the Add menu, ⌘O, ⇧⌘O, the Add cards, drops) goes through
 * `start`, which joins the haul that is running. Progress is pushed by main; this only mirrors it.
 */
export function useGather() {
  const haul = useCopyStore((s) => s.haul)

  useEffect(() => {
    const { setHaul, applyProgress } = useCopyStore.getState()
    let live = true
    // A haul still running (or paused) from before a relaunch shows up straight away.
    void window.api.invoke(IPC_CHANNELS.COPY_STATUS, undefined).then((res) => {
      if (!live || !res.success || !res.data.haul) return
      const found = res.data.haul
      if (found.state === 'running' || found.state === 'paused') setHaul(found)
    })
    const off = subscribePush(IPC_CHANNELS.COPY_PROGRESS, applyProgress)
    return () => {
      live = false
      off()
    }
  }, [])

  const start = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return
    const res = await window.api.invoke(IPC_CHANNELS.COPY_START, { paths })
    if (!res.success) return toast(FAILED)
    useCopyStore.getState().setHaul(res.data)
  }, [])

  const addFiles = useCallback(async () => {
    const res = await window.api.invoke(IPC_CHANNELS.DIALOG_SELECT_PSD_FILES, undefined)
    if (res.success) await start(res.data.paths)
  }, [start])

  const addFolder = useCallback(async () => {
    const res = await window.api.invoke(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY, undefined)
    if (res.success && res.data.path) await start([res.data.path])
  }, [start])

  const cancel = useCallback(async () => {
    const current = useCopyStore.getState().haul
    if (!current) return
    await window.api.invoke(IPC_CHANNELS.COPY_CANCEL, { haulId: current.haulId })
  }, [])

  const retry = useCallback(async () => {
    const current = useCopyStore.getState().haul
    if (!current) return
    const res = await window.api.invoke(IPC_CHANNELS.COPY_RETRY, { haulId: current.haulId })
    if (res.success) useCopyStore.getState().setHaul(res.data)
  }, [])

  /** Keep what landed. */
  const keep = useCallback(() => useCopyStore.getState().dismiss(), [])

  const undoAll = useCallback(async () => {
    const current = useCopyStore.getState().haul
    if (!current) return
    const res = await window.api.invoke(IPC_CHANNELS.COPY_UNDO_ALL, { haulId: current.haulId })
    useCopyStore.getState().dismiss()
    if (res.success) toast({ variant: 'success', ...undoneMessage(res.data.tossedIds.length) })
    else toast({ variant: 'error', message: 'Couldn’t undo the copy. Try again.' })
  }, [])

  return {
    haul,
    copying: haul?.state === 'running',
    start,
    addFiles,
    addFolder,
    cancel,
    retry,
    keep,
    undoAll
  }
}
