import { useCallback, useEffect, useRef, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { COULDNT_SUGGEST_PILES, type GroupMember } from '@shared/grouping'
import { mockupCountLabel } from '@shared/pile-title'
import { ActionBar } from '@renderer/components/ActionBar'
import { Banner } from '@renderer/components/Banner'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { ErrorState } from '@renderer/components/ErrorState'
import { FlowModal } from '@renderer/components/FlowModal'
import { useShortcut } from '@renderer/lib/shortcuts'
import { toast, undoToast } from '@renderer/stores/toastStore'
import { Skeleton } from '@renderer/ui/skeleton'
import {
  boardFromProposal,
  boardFromSaved,
  boardReducer,
  canDisband,
  canNewPile,
  toSortBoard,
  type BoardAction,
  type BoardState
} from './board-model'
import { SortBoard } from './SortBoard'
import { SortMenu } from './SortMenu'
import { NEW_PILE_ID, type MenuTarget } from './menu-model'

export interface SortFlowProps {
  open: boolean
  /** The import batch to sort. */
  batchId: string | null
  /** The batch is still being copied: the board only has what has arrived so far (S1.E1). */
  copying?: boolean
  /** Finish later, or the board is done with. */
  onClose: () => void
  /** The piles are confirmed: carry on to Look it over for this batch. */
  onLookThemOver: (batchId: string) => void
}

type Loaded =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; board: BoardState; suggestionFailed: boolean }

/** A fresh id for a pile the user makes. Unique across sessions, since boards are saved. */
const freshPileId = () =>
  globalThis.crypto?.randomUUID?.() ?? `pile-${Date.now()}-${Math.random().toString(36).slice(2)}`

/** Actions that make a pile arrive with a placeholder id; this swaps in a real one. */
function withPileId(action: BoardAction): BoardAction {
  if ((action.type === 'new-pile' || action.type === 'drop') && action.newPileId === NEW_PILE_ID) {
    return { ...action, newPileId: freshPileId() }
  }
  if (
    action.type === 'move-to' &&
    action.destination.kind === 'new-pile' &&
    action.destination.newPileId === NEW_PILE_ID
  ) {
    return { ...action, destination: { kind: 'new-pile', newPileId: freshPileId() } }
  }
  return action
}

function BoardSkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-6">
      {[0, 1].map((n) => (
        <Skeleton key={n} className="h-56 rounded-xl" />
      ))}
      <Skeleton className="col-span-2 h-40 rounded-xl" />
    </div>
  )
}

interface SessionProps {
  initial: BoardState
  batchId: string
  copying: boolean
  onClose: () => void
  onLookThemOver: (batchId: string) => void
}

/** The board once it has loaded: owns the state, the menu, the shortcuts and the two exits. */
function SortSession({ initial, batchId, copying, onClose, onLookThemOver }: SessionProps) {
  const [state, setState] = useState(initial)
  const latest = useRef(initial)
  const [menu, setMenu] = useState<{ target: MenuTarget; at: { x: number; y: number } } | null>(
    null
  )
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)

  const apply = useCallback((action: BoardAction) => {
    const next = boardReducer(latest.current, action)
    latest.current = next
    setState(next)
  }, [])

  /** Every board change goes through here, so each one can raise its Undo toast. */
  const send = useCallback(
    (action: BoardAction) => {
      let next = boardReducer(latest.current, withPileId(action))
      if (next.notice) {
        undoToast(next.notice, () => apply({ type: 'undo' }))
        next = { ...next, notice: null }
      }
      latest.current = next
      setState(next)
    },
    [apply]
  )

  useShortcut({
    id: 'sort.select-all',
    combo: 'mod+a',
    scope: 'sort',
    handler: () => send({ type: 'select-all' })
  })
  useShortcut({
    id: 'sort.new-pile',
    combo: 'mod+g',
    scope: 'sort',
    handler: () => canNewPile(latest.current) && send({ type: 'new-pile', newPileId: NEW_PILE_ID })
  })
  useShortcut({
    id: 'sort.disband',
    combo: 'mod+shift+g',
    scope: 'sort',
    handler: () => canDisband(latest.current) && send({ type: 'disband' })
  })
  useShortcut({
    id: 'sort.undo',
    combo: 'mod+z',
    scope: 'sort',
    handler: () => send({ type: 'undo' })
  })

  const total = Object.keys(state.tiles).length

  /** Esc or a click outside: first put down what is in hand or selected, then ask about leaving. */
  const requestClose = () => {
    if (menu) return setMenu(null)
    const current = latest.current
    if (current.drag || current.selectedTiles.length > 0 || current.selectedPiles.length > 0) {
      send({ type: 'cancel' })
      return
    }
    setAsking(true)
  }

  const finishLater = async () => {
    setBusy(true)
    const res = await window.api.invoke(
      IPC_CHANNELS.SORT_BOARD_SAVE,
      toSortBoard(latest.current, batchId)
    )
    setBusy(false)
    if (!res.success) {
      toast({ variant: 'error', message: 'Couldn’t save your piles. Try again.' })
      return
    }
    setAsking(false)
    onClose()
  }

  const lookThemOver = async () => {
    setBusy(true)
    const res = await window.api.invoke(
      IPC_CHANNELS.GROUPING_CONFIRM,
      toSortBoard(latest.current, batchId)
    )
    setBusy(false)
    if (!res.success) {
      toast({ variant: 'error', message: 'Couldn’t save your piles. Try again.' })
      return
    }
    onClose()
    onLookThemOver(batchId)
  }

  return (
    <FlowModal
      open
      step="sort"
      count={mockupCountLabel(total)}
      onRequestClose={requestClose}
      body={
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {copying && (
            <Banner
              tone="info"
              title="Still copying"
              message="Files that arrive later wait in To sort for the next round."
              action={false}
              dismissible={false}
            />
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-0.5">
            <SortBoard
              state={state}
              dispatch={send}
              onMenu={(target, at) => setMenu({ target, at })}
            />
          </div>
          <ActionBar
            variant="modal"
            cancelLabel="Finish later"
            onCancel={() => setAsking(true)}
            cancelDisabled={busy}
            primaryLabel="Look them over"
            onPrimary={() => void lookThemOver()}
            primaryDisabled={busy || total === 0}
            primaryDisabledReason="Nothing left to look over"
          />
          <SortMenu
            state={state}
            target={menu?.target ?? null}
            at={menu?.at ?? { x: 0, y: 0 }}
            onClose={() => setMenu(null)}
            onAction={(action) => {
              setMenu(null)
              send(action)
            }}
          />
          <ConfirmDialog
            open={asking}
            variant="neutral"
            working={busy}
            title="Your haul isn’t stashed yet"
            description={`Your piles so far are kept. All ${mockupCountLabel(total)} wait in To sort until you come back.`}
            confirmLabel="Finish later"
            workingLabel="Saving…"
            cancelLabel="Keep going"
            onCancel={() => setAsking(false)}
            onConfirm={() => void finishLater()}
          />
        </div>
      }
    />
  )
}

/**
 * SortFlow — step 1 of the flow modal: the Sort board for one import batch.
 * Figma: ↳ Sort › B2 · Sort into piles (S1 to S9), Finish later (I3.E2). It opens with the board the
 * user left (Finish later), or the suggested piles. If suggesting fails the board still works, with
 * everything on its own and a toast. Look them over saves the piles and hands the batch on.
 */
export function SortFlow({
  open,
  batchId,
  copying = false,
  onClose,
  onLookThemOver
}: SortFlowProps) {
  if (!open || batchId === null) return null
  return (
    <SortLoader
      key={batchId}
      batchId={batchId}
      copying={copying}
      onClose={onClose}
      onLookThemOver={onLookThemOver}
    />
  )
}

function SortLoader({ batchId, copying, onClose, onLookThemOver }: Omit<SessionProps, 'initial'>) {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    void (async () => {
      const [proposed, saved] = await Promise.all([
        window.api.invoke(IPC_CHANNELS.GROUPING_PROPOSE, { batchId }),
        window.api.invoke(IPC_CHANNELS.SORT_BOARD_LOAD, { batchId })
      ])
      if (!live) return
      if (!proposed.success) return setLoaded({ status: 'failed' })
      const proposal = proposed.data
      const members: GroupMember[] = [
        ...proposal.groups.flatMap((g) => g.members),
        ...proposal.singletons
      ]
      const board = saved.success && saved.data.board
      setLoaded({
        status: 'ready',
        board: board ? boardFromSaved(board, members) : boardFromProposal(proposal),
        // A saved board is the user's own, so only a fresh suggestion that failed is worth a toast.
        suggestionFailed: !board && proposal.suggestionFailed === true
      })
    })()
    return () => {
      live = false
    }
  }, [batchId, attempt])

  const failedToSuggest = loaded.status === 'ready' && loaded.suggestionFailed
  useEffect(() => {
    if (!failedToSuggest) return
    toast({
      message: COULDNT_SUGGEST_PILES,
      action: {
        label: 'Try again',
        onClick: () => {
          setLoaded({ status: 'loading' })
          setAttempt((n) => n + 1)
        }
      }
    })
  }, [failedToSuggest])

  if (loaded.status === 'ready') {
    return (
      <SortSession
        initial={loaded.board}
        batchId={batchId}
        copying={copying}
        onClose={onClose}
        onLookThemOver={onLookThemOver}
      />
    )
  }
  return (
    <FlowModal
      open
      step="sort"
      count="…"
      onRequestClose={onClose}
      body={
        loaded.status === 'failed' ? (
          <ErrorState
            variant="inline"
            title="Couldn’t open these"
            message="Try again in a moment."
            showDetails={false}
            retryLabel="Try again"
            onRetry={() => {
              setLoaded({ status: 'loading' })
              setAttempt((n) => n + 1)
            }}
            secondaryLabel="Close"
            onSecondary={onClose}
          />
        ) : (
          <BoardSkeleton />
        )
      }
    />
  )
}
