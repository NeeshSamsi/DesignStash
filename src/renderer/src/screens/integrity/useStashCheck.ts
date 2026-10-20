import { useCallback, useEffect, useRef, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { DriftReport } from '@shared/integrity'
import type { ReconciliationPanelProps } from '@renderer/components/ReconciliationPanel'
import { formatBytes } from '@renderer/lib/inbox-list'
import { toast, undoToast } from '@renderer/stores/toastStore'
import { stashCheckCopy as copy } from './stash-check-copy'

type PanelState = NonNullable<ReconciliationPanelProps['state']>
type Item = NonNullable<ReconciliationPanelProps['found']>[number]

export interface StashCheck {
  state: PanelState
  found: Item[]
  gone: Item[]
  resolvingId: string | undefined
  add: (id: string) => void
  addAll: () => void
  ignore: (id: string) => void
  ignoreAll: () => void
  remove: (id: string) => void
  removeAll: () => void
  relink: (id: string) => void
}

const cover = (path: string | undefined) => (path ? { coverSrc: `file://${path}` } : {})

function toItems(report: DriftReport): { found: Item[]; gone: Item[] } {
  return {
    found: report.found.map((f) => ({
      id: f.id,
      name: f.name,
      detail:
        f.sizeBytes === null
          ? 'Not in your stash yet'
          : `Not in your stash yet · ${formatBytes(f.sizeBytes)}`,
      ...cover(f.coverPath)
    })),
    gone: report.gone.map((g) => ({ id: g.id, name: g.name, ...cover(g.coverPath) }))
  }
}

/**
 * The stash check's findings and what to do with them. Add, Ignore and Remove take the rows out at
 * once; Undo and Relink check again, which shows skeleton rows. Every action that can be undone
 * says so in a toast. A check that fails closes the modal and points at Settings › My Stash.
 */
export function useStashCheck(opts: {
  /** The findings already in hand (the launch check), so the modal opens straight on them. */
  initial?: DriftReport | undefined
  onFailed: () => void
  onOpenSettings: () => void
}): StashCheck {
  const { initial, onFailed, onOpenSettings } = opts
  const [seeded] = useState(initial !== undefined)
  const [lists, setLists] = useState(() => (initial ? toItems(initial) : { found: [], gone: [] }))
  const [phase, setPhase] = useState<'scanning' | 'rescanning' | 'ready' | 'resolving'>(
    initial ? 'ready' : 'scanning'
  )
  const [resolvingId, setResolvingId] = useState<string | undefined>()
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  /** Asks main what changed. A check that fails closes the modal with a toast, and gives back null. */
  const check = useCallback(async (): Promise<DriftReport | null> => {
    const res = await window.api.invoke(IPC_CHANNELS.INTEGRITY_REPORT, undefined).catch(() => null)
    if (!live.current) return null
    if (!res?.success) {
      toast({
        variant: 'error',
        message: copy.couldNotCheck.message,
        description: copy.couldNotCheck.description,
        action: { label: copy.couldNotCheck.action, onClick: onOpenSettings }
      })
      onFailed()
      return null
    }
    return res.data
  }, [onFailed, onOpenSettings])

  useEffect(() => {
    if (seeded) return
    void check().then((report) => {
      if (!report) return
      setLists(toItems(report))
      setPhase('ready')
    })
  }, [seeded, check])

  /** Check again, with skeleton rows in the meantime. */
  const load = async (): Promise<void> => {
    setPhase('rescanning')
    const report = await check()
    if (!report) return
    setLists(toItems(report))
    setPhase('ready')
  }

  const without = (ids: string[]) =>
    setLists((l) => ({
      found: l.found.filter((i) => !ids.includes(i.id)),
      gone: l.gone.filter((i) => !ids.includes(i.id))
    }))

  const add = async (ids: string[] | 'all') => {
    const targets = ids === 'all' ? lists.found.map((i) => i.id) : ids
    setPhase('resolving')
    setResolvingId(ids === 'all' ? undefined : ids[0])
    const res =
      ids === 'all'
        ? await window.api.invoke(IPC_CHANNELS.INTEGRITY_ADD_ALL, undefined)
        : await window.api.invoke(IPC_CHANNELS.INTEGRITY_ADD, { ids })
    setResolvingId(undefined)
    if (!res.success) {
      setPhase('ready')
      toast({ variant: 'error', message: copy.couldNotAdd })
      return
    }
    without(targets)
    setPhase('ready')
    const { mockupIds } = res.data
    if (mockupIds.length === 0) return
    undoToast(copy.added(mockupIds.length), () => {
      void (async () => {
        const undone = await window.api
          .invoke(IPC_CHANNELS.INTEGRITY_UNDO_ADD, { mockupIds })
          .catch(() => null)
        if (!undone?.success) return toast({ variant: 'error', message: copy.couldNotUndo })
        if (live.current) await load()
      })()
    })
  }

  const ignore = async (ids: string[] | 'all') => {
    setPhase('resolving')
    const res =
      ids === 'all'
        ? await window.api.invoke(IPC_CHANNELS.INTEGRITY_IGNORE_ALL, undefined)
        : await window.api.invoke(IPC_CHANNELS.INTEGRITY_IGNORE, { ids })
    if (!res.success) {
      setPhase('ready')
      toast({ variant: 'error', message: copy.couldNotIgnore })
      return
    }
    const { ignoredIds } = res.data
    without(ignoredIds)
    setPhase('ready')
    if (ignoredIds.length === 0) return
    undoToast(copy.ignored(ignoredIds.length), () => {
      void (async () => {
        const back = await window.api
          .invoke(IPC_CHANNELS.INTEGRITY_UNIGNORE, { ids: ignoredIds })
          .catch(() => null)
        if (!back?.success) return toast({ variant: 'error', message: copy.couldNotUndo })
        if (live.current) await load()
      })()
    })
  }

  const remove = async (ids: string[] | 'all') => {
    const targets = ids === 'all' ? lists.gone.map((i) => i.id) : ids
    setPhase('resolving')
    setResolvingId(ids === 'all' ? undefined : ids[0])
    const res =
      ids === 'all'
        ? await window.api.invoke(IPC_CHANNELS.INTEGRITY_REMOVE_ALL, undefined)
        : await window.api.invoke(IPC_CHANNELS.INTEGRITY_REMOVE, { ids })
    setResolvingId(undefined)
    if (!res.success) {
      setPhase('ready')
      toast({ variant: 'error', message: copy.couldNotRemove })
      return
    }
    without(targets)
    setPhase('ready')
    toast({ variant: 'success', message: copy.removed(res.data.removed) })
  }

  const relink = async (id: string) => {
    setPhase('resolving')
    setResolvingId(id)
    // Main opens the file dialog itself.
    const res = await window.api.invoke(IPC_CHANNELS.INTEGRITY_RELINK, { id }).catch(() => null)
    setResolvingId(undefined)
    if (!res?.success) {
      setPhase('ready')
      toast({ variant: 'error', message: copy.relink.failed })
      return
    }
    const { outcome } = res.data
    if (outcome === 'relinked') {
      toast({ variant: 'success', message: copy.relinked })
      await load()
      return
    }
    setPhase('ready')
    if (outcome !== 'cancelled') toast({ variant: 'error', message: copy.relink[outcome] })
  }

  const checking = phase === 'scanning' || phase === 'rescanning'
  const state: PanelState =
    phase === 'scanning'
      ? 'scanning'
      : phase === 'rescanning'
        ? 'rescanning'
        : phase === 'resolving'
          ? 'resolving'
          : lists.found.length + lists.gone.length === 0
            ? 'all-resolved'
            : 'drift'

  return {
    state,
    found: checking ? [] : lists.found,
    gone: checking ? [] : lists.gone,
    resolvingId,
    add: (id) => void add([id]),
    addAll: () => void add('all'),
    ignore: (id) => void ignore([id]),
    ignoreAll: () => void ignore('all'),
    remove: (id) => void remove([id]),
    removeAll: () => void remove('all'),
    relink: (id) => void relink(id)
  }
}
