import { useCallback, useEffect, useRef, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import {
  COULDNT_SUGGEST_PILES,
  TO_SORT_BOARD,
  type GroupMember,
  type SortBoard as SavedBoard
} from '@shared/grouping'
import { mockups } from '@renderer/lib/plural'
import { ActionBar } from '@renderer/components/ActionBar'
import { Banner } from '@renderer/components/Banner'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { ErrorState } from '@renderer/components/ErrorState'
import { FlowModal } from '@renderer/components/FlowModal'
import { useShortcut } from '@renderer/lib/shortcuts'
import { useFlowOpen } from '@renderer/stores/copyStore'
import { toast, undoToast } from '@renderer/stores/toastStore'
import { Button } from '@renderer/ui/button'
import { Skeleton } from '@renderer/ui/skeleton'
import {
  boardFromProposal,
  boardFromSaved,
  makeBoardReducer,
  mergeBoard,
  canDisband,
  canNewPile,
  toSortBoard,
  type BoardAction,
  type BoardState
} from './board-model'
import { SortBoard } from './SortBoard'
import { SortMenu } from './SortMenu'
import type { MenuTarget } from './menu-model'

/**
 * What the board is open on: everything waiting in To sort, whichever import it came in with, or
 * just the mockups picked (“Sort 3”).
 */
export type SortScope = { kind: 'all' } | { kind: 'only'; mockupIds: readonly number[] }

export interface SortFlowProps {
  open: boolean
  /** Everything in To sort when left out. */
  scope?: SortScope
  /** A haul is still being copied: the board only has what has arrived so far (S1.E1). */
  copying?: boolean
  /** Finish later, or the board is done with. */
  onClose: () => void
  /** The piles are confirmed: carry on to Look it over. */
  onLookThemOver: () => void
}

const ALL: SortScope = { kind: 'all' }

const SORT_GUIDANCE = 'Drag mockups together to make a pile. Leave the rest on their own.'

type Loaded =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; board: BoardState; whole: SavedBoard | null; suggestionFailed: boolean }

/** A fresh id for a pile the user makes. Unique across sessions, since boards are saved. */
const freshPileId = () =>
  globalThis.crypto?.randomUUID?.() ?? `pile-${Date.now()}-${Math.random().toString(36).slice(2)}`

const boardReducer = makeBoardReducer(freshPileId)

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
  /** The whole board, when this one holds only the mockups picked: Finish later puts them back in it. */
  whole: SavedBoard | null
  copying: boolean
  onClose: () => void
  onLookThemOver: () => void
}

/** The board once it has loaded: owns the state, the menu, the shortcuts and the two exits. */
function SortSession({ initial, whole, copying, onClose, onLookThemOver }: SessionProps) {
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
      let next = boardReducer(latest.current, action)
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
    handler: () => canNewPile(latest.current) && send({ type: 'new-pile' })
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
    const board = toSortBoard(latest.current, TO_SORT_BOARD)
    const res = await window.api.invoke(
      IPC_CHANNELS.SORT_BOARD_SAVE,
      whole ? mergeBoard(whole, board, freshPileId) : board
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
      toSortBoard(latest.current, TO_SORT_BOARD)
    )
    setBusy(false)
    if (!res.success) {
      toast({ variant: 'error', message: 'Couldn’t save your piles. Try again.' })
      return
    }
    onClose()
    onLookThemOver()
  }

  return (
    <FlowModal
      open
      step="sort"
      count={mockups(total)}
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
          <div className="flex min-h-8 items-center justify-between gap-4">
            <p className="type-body-sm-regular text-muted-foreground">{SORT_GUIDANCE}</p>
            {state.selectedTiles.length >= 2 && (
              <Button
                variant="outline-subtle"
                size="sm"
                disabled={!canNewPile(state)}
                onClick={() => send({ type: 'new-pile' })}
              >
                Make pile
              </Button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-0.5">
            <SortBoard
              state={state}
              dispatch={send}
              onMenu={(target, at) => setMenu({ target, at })}
              menuOpen={menu !== null}
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
            description={`Your piles so far are kept. All ${mockups(total)} wait in To sort until you come back.`}
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
 * SortFlow — step 1 of the flow modal: the Sort board for everything waiting in To sort, across
 * imports, or for just the mockups picked (“Sort 3”).
 * Figma: ↳ Sort › B2 · Sort into piles (S1 to S9), Finish later (I3.E2). It opens with the board the
 * user left (Finish later), or the suggested piles. If suggesting fails the board still works, with
 * everything on its own and a toast. Look them over saves the piles and hands them on.
 */
export function SortFlow({
  open,
  scope = ALL,
  copying = false,
  onClose,
  onLookThemOver
}: SortFlowProps) {
  useFlowOpen(open)
  if (!open) return null
  return (
    <SortLoader
      key={scope.kind === 'all' ? 'all' : scope.mockupIds.join()}
      scope={scope}
      copying={copying}
      onClose={onClose}
      onLookThemOver={onLookThemOver}
    />
  )
}

function SortLoader({
  scope,
  copying,
  onClose,
  onLookThemOver
}: Omit<SessionProps, 'initial' | 'whole'> & { scope: SortScope }) {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  // Read once per opening: SortFlow keys this by the scope.
  const opened = useRef(scope)

  useEffect(() => {
    let live = true
    void (async () => {
      const [proposed, saved] = await Promise.all([
        window.api.invoke(IPC_CHANNELS.GROUPING_PROPOSE, { batchId: TO_SORT_BOARD }),
        window.api.invoke(IPC_CHANNELS.SORT_BOARD_LOAD, { batchId: TO_SORT_BOARD })
      ])
      if (!live) return
      if (!proposed.success) return setLoaded({ status: 'failed' })
      const proposal = proposed.data
      const all: GroupMember[] = [
        ...proposal.groups.flatMap((g) => g.members),
        ...proposal.singletons
      ]
      const board = saved.success ? saved.data.board : null
      const whole = board ?? toSortBoard(boardFromProposal(proposal), TO_SORT_BOARD)
      const picked = opened.current.kind === 'only' ? new Set(opened.current.mockupIds) : null
      const members = picked ? all.filter((m) => picked.has(m.mockupId)) : all
      setLoaded({
        status: 'ready',
        // The piles the whole board has, cut to the mockups picked.
        board: boardFromSaved(whole, members),
        whole: picked ? whole : null,
        // A saved board is the user's own, so only a fresh suggestion that failed is worth a toast.
        suggestionFailed: !board && proposal.suggestionFailed === true
      })
    })()
    return () => {
      live = false
    }
  }, [attempt])

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
        whole={loaded.whole}
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
