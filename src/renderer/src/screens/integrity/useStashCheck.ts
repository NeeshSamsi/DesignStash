import { useCallback, useEffect, useRef, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { DriftReport } from '@shared/integrity'
import type { ReconciliationPanelProps } from '@renderer/components/ReconciliationPanel'
import { formatBytes } from '@renderer/lib/inbox-list'
import { toast, undoToast } from '@renderer/stores/toastStore'
import { useUndoRan } from '@renderer/lib/undo-router'
import { stashCheckCopy as copy } from './stash-check-copy'
import { coverUrl } from '@shared/cover-url'

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

/** One value for where the check is: checking, showing rows, or working on one (`id`) or all of them. */
type Phase = { kind: 'scanning' | 'rescanning' | 'ready' } | { kind: 'resolving'; id?: string }

const cover = (path: string | undefined) => (path ? { coverSrc: coverUrl(path) } : {})

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
  const [phase, setPhase] = useState<Phase>({ kind: initial ? 'ready' : 'scanning' })
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  /** Actions and Undos run one at a time, so an Undo clicked mid-action waits its turn. */
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(task, task)
    queue.current = next.catch(() => undefined)
    return next
  }

  /** Marks the row (or the whole panel) as resolving while `fn` runs, and always lets go after. */
  const run = async <T>(id: string | undefined, fn: () => Promise<T>): Promise<T> => {
    setPhase(id === undefined ? { kind: 'resolving' } : { kind: 'resolving', id })
    try {
      return await fn()
    } finally {
      setPhase((p) => (p.kind === 'resolving' ? { kind: 'ready' } : p))
    }
  }

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

  /** Only the latest check may write its result, and a result never replaces 'resolving'. */
  const latest = useRef(0)
  const apply = useCallback((report: DriftReport) => {
    setLists(toItems(report))
    setPhase((p) => (p.kind === 'resolving' ? p : { kind: 'ready' }))
  }, [])

  useEffect(() => {
    if (seeded) return
    const mine = ++latest.current
    void check().then((report) => {
      if (report && mine === latest.current) apply(report)
    })
  }, [seeded, check, apply])

  /** Check again, with skeleton rows in the meantime. */
  const load = async (): Promise<void> => {
    const mine = ++latest.current
    setPhase((p) => (p.kind === 'resolving' ? p : { kind: 'rescanning' }))
    const report = await check()
    if (report && mine === latest.current) apply(report)
  }

  // An add or ignore undone from the app's history brings its files back to the lists.
  useUndoRan(() => void load())

  const without = (ids: string[]) =>
    setLists((l) => ({
      found: l.found.filter((i) => !ids.includes(i.id)),
      gone: l.gone.filter((i) => !ids.includes(i.id))
    }))

  const undoWith = (channel: 'add' | 'ignore', payload: unknown) =>
    void enqueue(async () => {
      const undone = await (
        channel === 'add'
          ? window.api.invoke(IPC_CHANNELS.INTEGRITY_UNDO_ADD, payload as { mockupIds: number[] })
          : window.api.invoke(IPC_CHANNELS.INTEGRITY_UNIGNORE, payload as { ids: string[] })
      ).catch(() => null)
      if (!undone?.success) return toast({ variant: 'error', message: copy.couldNotUndo })
      if (live.current) await load()
    })

  const add = (ids: string[] | 'all') =>
    enqueue(() =>
      run(ids === 'all' ? undefined : ids[0], async () => {
        const targets = ids === 'all' ? lists.found.map((i) => i.id) : ids
        const res = await (
          ids === 'all'
            ? window.api.invoke(IPC_CHANNELS.INTEGRITY_ADD_ALL, undefined)
            : window.api.invoke(IPC_CHANNELS.INTEGRITY_ADD, { ids })
        ).catch(() => null)
        if (!res?.success) return toast({ variant: 'error', message: copy.couldNotAdd })
        without(targets)
        const { mockupIds, undoEntryId } = res.data
        if (mockupIds.length === 0) return
        undoToast(
          copy.added(mockupIds.length),
          () => undoWith('add', { mockupIds }),
          undefined,
          undoEntryId
        )
      })
    )

  const ignore = (ids: string[] | 'all') =>
    enqueue(() =>
      run(undefined, async () => {
        const res = await (
          ids === 'all'
            ? window.api.invoke(IPC_CHANNELS.INTEGRITY_IGNORE_ALL, undefined)
            : window.api.invoke(IPC_CHANNELS.INTEGRITY_IGNORE, { ids })
        ).catch(() => null)
        if (!res?.success) return toast({ variant: 'error', message: copy.couldNotIgnore })
        const { ignoredIds, undoEntryId } = res.data
        without(ignoredIds)
        if (ignoredIds.length === 0) return
        undoToast(
          copy.ignored(ignoredIds.length),
          () => undoWith('ignore', { ids: ignoredIds }),
          undefined,
          undoEntryId
        )
      })
    )

  const remove = (ids: string[] | 'all') =>
    enqueue(() =>
      run(ids === 'all' ? undefined : ids[0], async () => {
        const targets = ids === 'all' ? lists.gone.map((i) => i.id) : ids
        const res = await (
          ids === 'all'
            ? window.api.invoke(IPC_CHANNELS.INTEGRITY_REMOVE_ALL, undefined)
            : window.api.invoke(IPC_CHANNELS.INTEGRITY_REMOVE, { ids })
        ).catch(() => null)
        if (!res?.success) return toast({ variant: 'error', message: copy.couldNotRemove })
        without(targets)
        toast({ variant: 'success', message: copy.removed(res.data.removed) })
      })
    )

  const relink = (id: string) =>
    enqueue(async () => {
      // Main opens the file dialog itself.
      const outcome = await run(id, async () => {
        const res = await window.api.invoke(IPC_CHANNELS.INTEGRITY_RELINK, { id }).catch(() => null)
        if (!res?.success) {
          toast({ variant: 'error', message: copy.relink.failed })
          return 'cancelled' as const
        }
        if (res.data.outcome === 'relinked') toast({ variant: 'success', message: copy.relinked })
        else if (res.data.outcome !== 'cancelled') {
          toast({ variant: 'error', message: copy.relink[res.data.outcome] })
        }
        return res.data.outcome
      })
      if (outcome === 'relinked') await load()
    })

  const state: PanelState =
    phase.kind === 'ready'
      ? lists.found.length + lists.gone.length === 0
        ? 'all-resolved'
        : 'drift'
      : phase.kind
  const checking = phase.kind === 'scanning' || phase.kind === 'rescanning'

  return {
    state,
    found: checking ? [] : lists.found,
    gone: checking ? [] : lists.gone,
    resolvingId: phase.kind === 'resolving' ? phase.id : undefined,
    add: (id) => void add([id]),
    addAll: () => void add('all'),
    ignore: (id) => void ignore([id]),
    ignoreAll: () => void ignore('all'),
    remove: (id) => void remove([id]),
    removeAll: () => void remove('all'),
    relink: (id) => void relink(id)
  }
}
