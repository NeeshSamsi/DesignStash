import { useEffect, useReducer, useRef, useState } from 'react'
import type { AnswerEditRequest, LookOverItem, LookOverQueue } from '@shared/approval'
import { IPC_CHANNELS } from '@shared/ipc'
import { AiStatus } from '@renderer/components/AiStatus'
import { Button } from '@renderer/components/Button'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { CoverPanel } from '@renderer/components/CoverPanel'
import { ErrorState } from '@renderer/components/ErrorState'
import { FlowModal } from '@renderer/components/FlowModal'
import { Lightbox } from '@renderer/components/Lightbox'
import { MockupCard } from '@renderer/components/MockupCard'
import { MockupMetaForm, type MetaField } from '@renderer/components/MockupMetaForm'
import { PileRail } from '@renderer/components/PileRail'
import { PileStep } from '@renderer/components/PileStep'
import { Tooltip } from '@renderer/components/Tooltip'
import { useTagVocabulary } from '@renderer/hooks/use-tag-vocabulary'
import { subscribePush } from '@renderer/lib/subscribe'
import { useFlowOpen } from '@renderer/stores/copyStore'
import { toast, undoToast } from '@renderer/stores/toastStore'
import { useUiStore } from '@renderer/stores/uiStore'
import { Skeleton } from '@renderer/ui/skeleton'
import { checkLibrary } from '../details/check-library'
import { aiReducer, createAiState, keepOf } from './ai-state'
import {
  aiLine,
  isWriting,
  nextLineChange,
  opensWithRow,
  railNote,
  stashWait,
  writingFields
} from './ai-writing'
import { cardNote, headsUp, offerLine, offerPreview, railCarryNote } from './edit-offer'
import { EditOffer } from './EditOffer'
import {
  afterStash,
  back,
  backTarget,
  canSkip,
  createFlow,
  currentItem,
  currentUnit,
  cardTitle,
  deck,
  finished,
  headerBadge,
  isPile,
  jumpTo,
  landedDraft,
  formOf,
  next,
  onReview,
  primary,
  progress,
  rail,
  reviewCards,
  skip,
  type DraftForm,
  type FlowState
} from './flow-model'
import {
  NO_COVER_REASON,
  NO_TITLE_REASON,
  SKIP_NOTE,
  doneMessage,
  stashRefusal
} from './look-over-copy'
import { coverUrl } from '@shared/cover-url'
import { fullTitle } from '@shared/pile-variation'
import { WRITING_PLACEHOLDER } from '@renderer/lib/writing-field'

interface LookOverFlowProps {
  open: boolean
  /** Finish later (confirmed), or all done. */
  onClose: () => void
  /** Back from the very first mockup, while nothing is stashed: the Sort board. Hidden without it. */
  onBackToSort?: () => void
}

type Form = DraftForm

interface Cover {
  path: string
  source: LookOverItem['cover']['source']
  missing: boolean
  width: number | null
  height: number | null
}

type Loaded =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; queue: LookOverQueue }

const tagIds = (form: Form) => form.tags.map((t) => t.tagId)
const sameForm = (a: Form, b: Form) =>
  a.title === b.title &&
  a.variation === b.variation &&
  a.description === b.description &&
  tagIds(a).join() === tagIds(b).join()

const panelSource = (cover: Cover): 'embedded' | 'sidecar' | 'uploaded' | 'none' =>
  cover.path === '' || cover.source === 'none'
    ? 'none'
    : cover.source === 'user-uploaded'
      ? 'uploaded'
      : cover.source === 'sidecar'
        ? 'sidecar'
        : 'embedded'

function Skeletons() {
  return (
    <div aria-hidden className="flex gap-6">
      <Skeleton className="aspect-card w-detail-media rounded-xl" />
      <div className="flex flex-1 flex-col gap-4">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-8 w-2/3 rounded-lg" />
      </div>
    </div>
  )
}

/** Look it over (B3): the haul, one mockup at a time, piles first. Everything in a pile is a draft until Stash pile. */
export function LookOverFlow({ open, onClose, onBackToSort }: LookOverFlowProps) {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useFlowOpen(open)

  useEffect(() => {
    if (!open) return
    let live = true
    void (async () => {
      setLoaded({ status: 'loading' })
      const res = await window.api.invoke(IPC_CHANNELS.LOOK_OVER_OPEN, undefined).catch(() => null)
      if (!live) return
      setLoaded(res?.success ? { status: 'ready', queue: res.data } : { status: 'failed' })
    })()
    return () => {
      live = false
    }
  }, [open, attempt])

  if (!open) return null

  if (loaded.status !== 'ready') {
    return (
      <FlowModal
        open
        step="look-over"
        count=""
        onRequestClose={onClose}
        body={
          loaded.status === 'loading' ? (
            <Skeletons />
          ) : (
            <ErrorState
              variant="inline"
              title="We couldn’t open Look it over"
              message="Your drafts are safe. Try again in a moment."
              onRetry={() => setAttempt((n) => n + 1)}
            />
          )
        }
      />
    )
  }
  return (
    <Session queue={loaded.queue} onClose={onClose} {...(onBackToSort ? { onBackToSort } : {})} />
  )
}

interface SessionProps {
  queue: LookOverQueue
  onClose: () => void
  onBackToSort?: () => void
}

function Session({ queue, onClose, onBackToSort }: SessionProps) {
  const [flow, setFlow] = useState<FlowState>(() => createFlow(queue))
  const [forms, setForms] = useState<Record<number, Form>>(() =>
    Object.fromEntries(queue.units.flatMap((u) => u.items.map((i) => [i.mockupId, formOf(i)])))
  )
  const [covers, setCovers] = useState<Record<number, Cover>>(() =>
    Object.fromEntries(queue.units.flatMap((u) => u.items.map((i) => [i.mockupId, i.cover])))
  )
  /** What main has, to tell an edit from nothing. */
  const saved = useRef<Record<number, Form>>(forms)
  const savedChecked = useRef(
    new Set(queue.units.flatMap((u) => u.items.filter((i) => i.checked).map((i) => i.mockupId)))
  )
  const stashedCount = useRef(0)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [coverState, setCoverState] = useState<'default' | 'replacing' | 'error'>('default')
  const [zooming, setZooming] = useState(false)
  const { vocabulary, createTag } = useTagVocabulary()
  // The AI's side of each mockup (design L6): main's latest items and runs, and what the person did.
  const [ai, dispatch] = useReducer(aiReducer, queue, (q) =>
    createAiState(q.units.flatMap((u) => u.items))
  )
  /** The latest AI state and the mockup on screen, for push handlers that subscribe once. */
  const aiRef = useRef(ai)
  const onScreen = useRef<number | null>(null)
  useEffect(() => {
    aiRef.current = ai
  }, [ai])
  /** The clock the status line reads; it moves when the line is due to change (nextLineChange). */
  const [now, setNow] = useState(() => Date.now())
  const formColumn = useRef<HTMLDivElement>(null)

  // A late AI suggestion filled in a draft: show it, keeping any field the person made theirs.
  useEffect(
    () =>
      subscribePush(IPC_CHANNELS.LOOK_OVER_DRAFT, (item) => {
        const was = saved.current[item.mockupId]
        if (!was) return
        const keep = keepOf(aiRef.current.writing[item.mockupId])
        saved.current = { ...saved.current, [item.mockupId]: formOf(item) }
        setForms((current) => ({
          ...current,
          [item.mockupId]: landedDraft(current[item.mockupId] ?? was, was, item, keep).form
        }))
        dispatch({
          type: 'draft',
          item,
          at: Date.now(),
          onScreen: onScreen.current === item.mockupId
        })
      }),
    []
  )
  useEffect(
    () =>
      subscribePush(IPC_CHANNELS.AI_STATUS, (event) =>
        dispatch({ type: 'status', updates: event.updates })
      ),
    []
  )

  const unit = currentUnit(flow)
  const item = currentItem(flow)
  const review = onReview(flow)
  const form = item ? forms[item.mockupId] : undefined
  const cover = item ? covers[item.mockupId] : undefined
  const pile = isPile(unit)
  const model = primary(flow)
  const theDeck = deck(flow)
  const theRail = rail(
    flow,
    Object.fromEntries(Object.entries(forms).map(([id, f]) => [id, f.title])),
    Object.fromEntries(Object.entries(forms).map(([id, f]) => [id, f.variation]))
  )
  const blocked = item && form ? form.title.trim() === '' : false
  const noCover = item && cover ? panelSource(cover) === 'none' : false

  // -- The AI writing (design L6) ----------------------------------------------------------------

  const here = item ? (ai.live[item.mockupId] ?? item) : null
  const hereWriting = here ? ai.writing[here.mockupId] : undefined
  const hereId = here?.mockupId
  /** Whether the mockup on screen has a status row: decided as it opens, kept until you move on. */
  const [visit, setVisit] = useState<{ id: number; row: boolean } | null>(null)

  // The mockup on screen goes first in the AI queue; its answer starts the slow clock and says where its run is.
  useEffect(() => {
    onScreen.current = hereId ?? null
    if (hereId === undefined) return
    const at = Date.now()
    void window.api
      .invoke(IPC_CHANNELS.LOOK_OVER_SHOWING, { mockupId: hereId })
      .then((res) => {
        if (res.success) dispatch({ type: 'showing', mockupId: hereId, update: res.data, at })
      })
      .catch(() => {})
    return () => dispatch({ type: 'left', mockupId: hereId })
  }, [hereId])

  const due = here ? nextLineChange(here, hereWriting, now) : null
  useEffect(() => {
    if (due === null) return
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, due - Date.now()))
    return () => clearTimeout(timer)
  }, [due])

  // -- The edit to the top (design L7) ---------------------------------------------------------

  const checksEdits = queue.checksEdits
  /** Variants the person applied the edit to in this session (L7.8's line). */
  const [accepted, setAccepted] = useState<ReadonlySet<number>>(new Set())
  /** The variant whose offer is being applied (it waits for a version still being prepared). */
  const [applying, setApplying] = useState<number | null>(null)
  /** Tops whose description or tags differ from what main has: L7.1's heads-up. */
  const [editedTops, setEditedTops] = useState<ReadonlySet<number>>(new Set())
  const pileItems = unit.items.map((i) => ai.live[i.mockupId] ?? i)
  const reached = pileItems.filter((i) => i.carry !== null).length
  const untouched = pileItems.filter((i) => i.role === 'variant' && !i.touched).length
  const offer = here
    ? offerLine(here.carry, { reached, acceptedHere: accepted.has(here.mockupId) })
    : null
  const heads =
    here?.role === 'top'
      ? headsUp({ edited: editedTops.has(here.mockupId), untouched, checksEdits })
      : null

  // The status row is decided when the mockup opens (each item says where its AI is and what an
  // edit did to it) and kept while it is on screen. A top with untouched variants always has one,
  // so L7.1's heads-up never pushes the fields down.
  if (here && visit?.id !== here.mockupId) {
    setVisit({
      id: here.mockupId,
      row:
        opensWithRow(here, hereWriting, now) ||
        offer !== null ||
        (here.role === 'top' && untouched > 0)
    })
  }
  const row = here !== null && visit?.id === here.mockupId && visit.row
  const line = (here ? aiLine(here, hereWriting, now) : null) ?? offer ?? heads

  /** A channel's answer is main's word on the mockup and its AI. */
  const answered = (res: { success: boolean; data?: LookOverItem | null } | null) => {
    if (res?.success && res.data) dispatch({ type: 'answer', item: res.data })
  }

  /**
   * Fill it myself (L6.E1): the AI stops for this mockup, for good (`look-over:fill-myself`). The
   * title starts from the file name, selected so typing replaces it, and the rest starts empty.
   */
  const fillMyself = (id: number, selectTitle: boolean) => {
    const it = ai.live[id]
    if (!it) return
    const fields = writingFields(it, ai.writing[id])
    setForms((current) => {
      const was = current[id]
      if (!was) return current
      return {
        ...current,
        [id]: {
          title: was.title,
          variation: was.variation,
          description: fields.includes('description') ? '' : was.description,
          tags: fields.includes('tags') ? [] : was.tags
        }
      }
    })
    dispatch({ type: 'fill-myself', mockupId: id })
    void window.api
      .invoke(IPC_CHANNELS.LOOK_OVER_FILL_MYSELF, { mockupId: id })
      .then(answered)
      .catch(() => {})
    if (selectTitle && fields.includes('title')) {
      // After the field stops writing and shows the file name, select it so typing replaces it.
      setTimeout(() => {
        // In a pile the AI writes the variation, which starts from the file name.
        const title = formColumn.current?.querySelector<HTMLInputElement>(
          it.variation ? 'input[aria-label="Variation"]' : 'input'
        )
        title?.focus()
        title?.select()
      }, 0)
    }
  }

  /**
   * Write suggestions (L6.E1) and Try again (L6.E3): ask the AI again (`look-over:write`). The fields
   * the person typed in stay theirs; the rest go back to main's and say “Writing with AI…” again.
   */
  const writeAgain = async (id: number) => {
    const res = await window.api
      .invoke(IPC_CHANNELS.LOOK_OVER_WRITE, { mockupId: id })
      .catch(() => null)
    if (!res?.success || !res.data) {
      toast({
        variant: 'error',
        message: 'Couldn’t ask the AI again',
        description: 'Your words are still here. Try again in a moment.'
      })
      return
    }
    const fresh = formOf(res.data)
    const typed = ai.writing[id]?.typed ?? []
    saved.current = { ...saved.current, [id]: fresh }
    setForms((current) => {
      const was = current[id] ?? fresh
      return {
        ...current,
        [id]: {
          // In a pile the title is the base, which the AI doesn't write again; the variation is.
          title: fresh.variation !== null || typed.includes('title') ? was.title : fresh.title,
          variation: typed.includes('title') ? was.variation : fresh.variation,
          description: typed.includes('description') ? was.description : fresh.description,
          tags: typed.includes('tags') ? was.tags : fresh.tags
        }
      }
    })
    answered(res)
  }

  /**
   * The person's answer to the top's edit on a variant (`look-over:answer-edit`): accept (Apply here,
   * Apply anyway), undo, dismiss (×) or restore (⌘Z). Accepting and undoing change its words, which
   * the form takes in every field the person hasn't changed.
   */
  const answerEdit = async (id: number, action: AnswerEditRequest['action']) => {
    if (action === 'accept') setApplying(id)
    const res = await window.api
      .invoke(IPC_CHANNELS.LOOK_OVER_ANSWER_EDIT, { mockupId: id, action })
      .catch(() => null)
    if (action === 'accept') setApplying(null)
    if (!res?.success) {
      toast({
        variant: 'error',
        message: 'Couldn’t change that',
        description: 'Nothing was changed. Try again.'
      })
      return
    }
    const it = res.data
    if (!it) return
    dispatch({ type: 'items', items: [it] })
    if (action === 'accept' || action === 'undo') {
      const was = saved.current[id]
      saved.current = { ...saved.current, [id]: formOf(it) }
      setForms((current) => ({
        ...current,
        [id]: was ? landedDraft(current[id] ?? was, was, it).form : formOf(it)
      }))
    }
    if (action === 'accept') {
      setAccepted((ids) => new Set([...ids, id]))
      dispatch({ type: 'tint', mockupId: id, fields: ['description'], at: Date.now() })
    }
    if (action === 'undo') setAccepted((ids) => new Set([...ids].filter((x) => x !== id)))
  }

  // ⌘Z brings back an offer dismissed on screen (L7.10). Outside a text field only, so typing keeps its own undo.
  const restorable = row && here?.carry?.state === 'dismissed' ? here.mockupId : null
  useEffect(() => {
    if (restorable === null) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      const z = event.key.toLowerCase() === 'z' && (event.metaKey || event.ctrlKey)
      if (!z || event.shiftKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (
        target?.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')
      )
        return
      event.preventDefault()
      void window.api
        .invoke(IPC_CHANNELS.LOOK_OVER_ANSWER_EDIT, { mockupId: restorable, action: 'restore' })
        .then((res) => {
          if (res.success && res.data) dispatch({ type: 'items', items: [res.data] })
        })
        .catch(() => {})
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [restorable])

  /** Saves the open mockup's draft when it changed or hasn't been recorded as looked at. */
  const saveCurrent = async (): Promise<boolean> => {
    if (!item || !form) return true
    const unchanged = sameForm(form, saved.current[item.mockupId]!)
    if (unchanged && savedChecked.current.has(item.mockupId)) return true
    if (form.title.trim() === '') return false
    const res = await window.api
      .invoke(IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT, {
        mockupId: item.mockupId,
        title: form.title.trim(),
        // In a pile the title is the base (renaming every draft in it) and this is its own part.
        ...(form.variation !== null ? { variation: form.variation } : {}),
        description: form.description,
        tagIds: tagIds(form)
      })
      .catch(() => null)
    if (!res?.success) {
      toast({
        variant: 'error',
        message: 'Couldn’t save your changes',
        description: 'Your edits are still here. Try again.'
      })
      return false
    }
    saved.current = { ...saved.current, [item.mockupId]: form }
    savedChecked.current.add(item.mockupId)
    setEditedTops((ids) => new Set([...ids].filter((id) => id !== item.mockupId)))
    if (res.data.propagatedIds.length > 0) {
      // The top mockup's edit carried over to variants that were not touched: show what they now hold.
      const fresh = await window.api
        .invoke(IPC_CHANNELS.LOOK_OVER_OPEN, undefined)
        .catch(() => null)
      if (fresh?.success) {
        const updated = fresh.data.units
          .flatMap((u) => u.items)
          .filter((i) => res.data.propagatedIds.includes(i.mockupId))
        dispatch({ type: 'items', items: updated })
        setForms((current) => ({
          ...current,
          ...Object.fromEntries(updated.map((i) => [i.mockupId, formOf(i)]))
        }))
        saved.current = {
          ...saved.current,
          ...Object.fromEntries(updated.map((i) => [i.mockupId, formOf(i)]))
        }
      }
    }
    return true
  }

  const go = async (move: (s: FlowState) => FlowState) => {
    if (!(await saveCurrent())) return
    setFlow(move)
  }

  const edit = (patch: Partial<Form>) => {
    if (!item || !form) return
    const next = { ...form, ...patch }
    setForms((current) => ({ ...current, [item.mockupId]: next }))
    if (item.role === 'top') {
      // L7.1: an edit to the top's description or tags reaches its untouched variants on Next.
      const was = saved.current[item.mockupId]
      const edited =
        !!was &&
        (next.description !== was.description || tagIds(next).join() !== tagIds(was).join())
      setEditedTops((ids) =>
        edited
          ? new Set([...ids, item.mockupId])
          : new Set([...ids].filter((id) => id !== item.mockupId))
      )
    }
    // Typing in a field the AI is writing makes it the person's (L6.2). In a pile the AI writes the
    // variation, so that is the title it means; the base is the pile's.
    const fields = (Object.keys(patch) as (keyof Form)[]).flatMap((key): MetaField[] =>
      key === 'variation' ? ['title'] : key === 'title' && form.variation !== null ? [] : [key]
    )
    dispatch({ type: 'typed', mockupId: item.mockupId, fields })
  }

  /**
   * The base renames the pile from any of its mockups (L8.1): every draft in it takes the new base
   * as it is typed, so the rail header follows. Saving sends it, and main renames them exactly.
   */
  const editBase = (base: string) => {
    const ids = new Set(unit.items.map((i) => i.mockupId))
    setForms((current) =>
      Object.fromEntries(
        Object.entries(current).map(([id, f]) => [
          id,
          ids.has(Number(id)) ? { ...f, title: base } : f
        ])
      )
    )
  }

  /** A variation left empty takes its file marker or number back when focus leaves (L8.2). */
  const restoreVariation = async () => {
    if (!item || form?.variation?.trim() !== '') return
    const id = item.mockupId
    const res = await window.api
      .invoke(IPC_CHANNELS.PILE_SET_VARIATION, { mockupId: id, words: '' })
      .catch(() => null)
    if (!res?.success) return
    const words = res.data.variation.words
    setForms((current) =>
      current[id] ? { ...current, [id]: { ...current[id], variation: words } } : current
    )
    const was = saved.current[id]
    if (was) saved.current = { ...saved.current, [id]: { ...was, variation: words } }
  }

  // -- Stash -----------------------------------------------------------------------------------

  const finish = (s: FlowState) => {
    if (finished(s)) {
      // Everything is tucked away: land where it now lives, not on an empty inbox.
      useUiStore.getState().setView('all')
      toast(doneMessage(stashedCount.current, 0), 'success')
      onClose()
    }
  }

  const undoStash = async (
    snapshot: Parameters<typeof window.api.invoke<'pile:unstash'>>[1]['snapshot'],
    unitId: number,
    count: number
  ) => {
    const res = await window.api.invoke(IPC_CHANNELS.PILE_UNSTASH, { snapshot }).catch(() => null)
    if (!res?.success) {
      toast({
        variant: 'error',
        message: 'Couldn’t undo that',
        description: 'It is still stashed. Try again from My Stash.'
      })
      return
    }
    stashedCount.current -= count
    const fresh = await window.api.invoke(IPC_CHANNELS.LOOK_OVER_OPEN, undefined).catch(() => null)
    if (!fresh?.success) return
    dispatch({ type: 'items', items: fresh.data.units.flatMap((u) => u.items) })
    setFlow((current) => {
      const index = current.units.findIndex((u) => u.unitId === unitId)
      const stashed = new Set([...current.stashed].filter((id) => id !== unitId))
      const target = fresh.data.units.find((u) => u.unitId === unitId)
      const units = current.units.map((u) => (u.unitId === unitId && target ? target : u))
      return {
        ...current,
        units,
        stashed,
        position: { unit: index, step: target && target.kind === 'pile' ? target.items.length : 0 }
      }
    })
  }

  const stash = async () => {
    if (!(await saveCurrent())) return
    setBusy(true)
    const res = pile
      ? await window.api.invoke(IPC_CHANNELS.PILE_STASH, { pileId: unit.unitId }).catch(() => null)
      : await window.api
          .invoke(IPC_CHANNELS.MOCKUP_STASH, { mockupId: unit.items[0]!.mockupId })
          .catch(() => null)
    setBusy(false)
    if (!res?.success) {
      toast({
        variant: 'error',
        message: 'Couldn’t stash that',
        description: 'Nothing was changed. Try again.'
      })
      return
    }
    if (!res.data.ok) {
      const copy = stashRefusal(res.data.reason)
      toast({ variant: 'error', message: copy.title, description: copy.description })
      const first = unit.items.findIndex(
        (i) => res.data.ok === false && res.data.mockupIds.includes(i.mockupId)
      )
      if (first !== -1) setFlow((s) => jumpTo(s, first))
      return
    }
    const { snapshot, stashedIds } = res.data
    stashedCount.current += stashedIds.length
    const unitId = unit.unitId
    const advanced = afterStash(flow)
    setFlow(advanced)
    undoToast(
      pile ? `Pile stashed · ${stashedIds.length} mockups` : 'Stashed',
      () => void undoStash(snapshot, unitId, stashedIds.length)
    )
    finish(advanced)
  }

  const primaryAction = () => {
    if (model.kind === 'next') void go(next)
    else void stash()
  }

  // -- Skip, back, finish later ----------------------------------------------------------------

  const doSkip = async () => {
    if (!item) return
    const res = await window.api
      .invoke(IPC_CHANNELS.LOOK_OVER_SKIP, { mockupId: item.mockupId })
      .catch(() => null)
    if (res?.success && res.data.skipped) setFlow(skip)
  }

  const target = backTarget(flow)
  const doBack = async () => {
    if (!target) return
    if (target.kind === 'sort') {
      onBackToSort?.()
      return
    }
    await go(back)
  }

  const finishLater = async () => {
    setBusy(true)
    const ok = await saveCurrent()
    if (ok) {
      const at = item ?? unit.items[0]!
      await window.api
        .invoke(IPC_CHANNELS.LOOK_OVER_SET_RESUME, { unitId: unit.unitId, mockupId: at.mockupId })
        .catch(() => null)
    }
    setBusy(false)
    if (!ok) return
    setAsking(false)
    const waiting = flow.units
      .filter((u) => !flow.stashed.has(u.unitId))
      .reduce((n, u) => n + u.items.length, 0)
    toast(
      stashedCount.current > 0
        ? `${stashedCount.current} tucked away · ${waiting} waiting in To stash.`
        : 'Your place is saved. Pick up in To stash.',
      'success'
    )
    onClose()
  }

  // -- Cover -----------------------------------------------------------------------------------

  const setCover = (id: number, next: Cover) => setCovers((current) => ({ ...current, [id]: next }))

  const replaceCover = (file: File) => {
    if (!item) return
    setCoverState('replacing')
    void window.api
      .invoke(IPC_CHANNELS.MOCKUP_SET_COVER, {
        mockupId: item.mockupId,
        filePath: window.api.getPathForFile(file)
      })
      .then((res) => {
        if (res.success && res.data.ok) {
          setCover(item.mockupId, {
            path: res.data.coverPath,
            source: res.data.coverSource,
            missing: false,
            width: res.data.width,
            height: res.data.height
          })
          setCoverState('default')
        } else setCoverState('error')
      })
      .catch(() => setCoverState('error'))
  }

  const useEmbedded = () => {
    if (!item) return
    void window.api
      .invoke(IPC_CHANNELS.MOCKUP_USE_EMBEDDED_COVER, { mockupId: item.mockupId })
      .then((res) => {
        if (res.success && res.data.ok) {
          setCover(item.mockupId, {
            path: res.data.coverPath,
            source: res.data.coverSource,
            missing: false,
            width: res.data.width,
            height: res.data.height
          })
        }
      })
  }

  // -- Render ----------------------------------------------------------------------------------

  // A pile's mockups share the base, so the wait names each by its card's title.
  const titles = Object.fromEntries(Object.entries(forms).map(([id, f]) => [id, cardTitle(f)]))
  // Stash pile waits until nothing in the pile is still writing (L6.E4).
  const wait = review
    ? stashWait(
        unit.items.map((i) => ai.live[i.mockupId] ?? i),
        ai.writing,
        titles
      )
    : null

  const footerPrimary = (
    <Tooltip label={wait ?? (blocked ? NO_TITLE_REASON : NO_COVER_REASON)} arrow="bottom-right">
      <span tabIndex={blocked || noCover || wait ? 0 : -1} className="inline-flex">
        <Button
          label={model.label}
          loading={busy}
          disabled={
            busy ||
            (review && wait !== null) ||
            (!review && (blocked || (noCover && model.kind !== 'next')))
          }
          onClick={primaryAction}
        />
      </span>
    </Tooltip>
  )

  const footer = (
    <div className="flex items-center gap-2 border-t border-subtle pt-4">
      {target && <Button variant="secondary" label="Back" onClick={() => void doBack()} />}
      {canSkip(flow) && (
        <Tooltip label={SKIP_NOTE} arrow="bottom-left">
          <span className="inline-flex">
            <Button variant="ghost" label="Skip for now" onClick={() => void doSkip()} />
          </span>
        </Tooltip>
      )}
      <div className="flex-1" />
      {wait && <p className="type-caption-xs-regular text-muted-foreground">{wait}</p>}
      <Button variant="ghost" label="Finish later" onClick={() => setAsking(true)} />
      {footerPrimary}
    </div>
  )

  const cards = reviewCards(flow)
  const body = review ? (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="grid min-h-0 flex-1 grid-cols-4 content-start gap-4 overflow-y-auto">
          {unit.items.map((it, step) => {
            // A card still writing says so, with its way out under it, outside the card (L6.E4).
            const writes = isWriting(ai.live[it.mockupId] ?? it, ai.writing[it.mockupId])
            const note = writes
              ? WRITING_PLACEHOLDER
              : (cardNote((ai.live[it.mockupId] ?? it).carry) ??
                cards.find((c) => c.mockupId === it.mockupId)?.note ??
                null)
            const c = covers[it.mockupId]
            return (
              <div key={it.mockupId} className="flex min-w-0 flex-col gap-2">
                <MockupCard
                  variant="pending-review"
                  mockupId={String(it.mockupId)}
                  title={cardTitle(forms[it.mockupId] ?? formOf(it))}
                  tags={note ?? forms[it.mockupId]?.tags.map((t) => t.label).join(' · ') ?? ''}
                  favourite={false}
                  {...(c?.path ? { coverSrc: coverUrl(c.path) } : {})}
                  onClick={() => void go((s) => jumpTo(s, step))}
                  onLookItOver={() => void go((s) => jumpTo(s, step))}
                />
                {writes && (
                  <Button
                    variant="ghost"
                    size="xs"
                    label="Fill it myself"
                    className="self-start"
                    onClick={() => fillMyself(it.mockupId, false)}
                  />
                )}
              </div>
            )
          })}
        </div>
        {theRail && <PileRail pile={theRail.pile} title={theRail.title} steps={railSteps()} />}
      </div>
      {footer}
    </div>
  ) : (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 flex-1 gap-6 overflow-y-auto">
        {cover && item && (
          <CoverPanel
            source={panelSource(cover)}
            state={coverState}
            coverMissing={cover.missing}
            showDeck={theDeck.showDeck}
            deckMore={theDeck.deckMore}
            deckLabel={theDeck.label}
            {...(cover.path ? { coverSrc: coverUrl(cover.path) } : {})}
            {...(cover.width && cover.height
              ? { imageSize: { width: cover.width, height: cover.height } }
              : {})}
            onCover={replaceCover}
            onUsePsdPreview={useEmbedded}
            onZoom={() => setZooming(true)}
          />
        )}
        <div ref={formColumn} className="flex min-w-0 flex-1 flex-col gap-5">
          {row && here && (
            <AiStatus
              key={here.mockupId}
              kind={line?.kind ?? 'none'}
              message={line?.message ?? ''}
              showAction={line?.action !== undefined}
              dismissible={line !== null && 'dismissible' in line && line.dismissible === true}
              onDismiss={() => void answerEdit(here.mockupId, 'dismiss')}
              action={
                line?.action === 'fill-myself' ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    label="Fill it myself"
                    onClick={() => fillMyself(here.mockupId, true)}
                  />
                ) : line?.action === 'try-again' || line?.action === 'write-suggestions' ? (
                  <Button
                    variant="secondary"
                    size="xs"
                    label={line.action === 'try-again' ? 'Try again' : 'Write suggestions'}
                    onClick={() => void writeAgain(here.mockupId)}
                  />
                ) : line?.action === 'undo' ? (
                  <Button
                    variant="secondary"
                    size="xs"
                    label="Undo"
                    onClick={() => void answerEdit(here.mockupId, 'undo')}
                  />
                ) : (line?.action === 'apply-here' || line?.action === 'apply-anyway') &&
                  here.carry ? (
                  <EditOffer
                    preview={offerPreview(here.carry, here.description, checksEdits)}
                    applying={applying === here.mockupId}
                    onApply={() => void answerEdit(here.mockupId, 'accept')}
                    tagsRow={() =>
                      formColumn.current?.querySelector<HTMLElement>('[data-ds="TagEditor"]') ??
                      null
                    }
                  />
                ) : null
              }
            />
          )}
          {form && (
            <MockupMetaForm
              variant="approval"
              state={blocked ? 'invalid' : 'pristine'}
              writingFields={here ? writingFields(here, hereWriting) : []}
              filledFields={hereWriting?.tint?.fields ?? []}
              title={form.title}
              onTitleChange={(title) => edit({ title })}
              {...(form.variation !== null && {
                titlePair: {
                  baseValue: form.title,
                  onBaseChange: editBase,
                  variationValue: form.variation,
                  onVariationChange: (variation: string) => edit({ variation }),
                  onVariationBlur: () => void restoreVariation(),
                  pileCount: unit.items.length
                }
              })}
              description={form.description}
              onDescriptionChange={(description) => edit({ description })}
              tagEditor={{
                tags: form.tags,
                onTagsChange: (tags) => edit({ tags }),
                suggestions: [],
                vocabulary,
                onCreateTag: createTag
              }}
            />
          )}
        </div>
        {theRail && <PileRail pile={theRail.pile} title={theRail.title} steps={railSteps()} />}
      </div>
      {footer}
    </div>
  )

  function railSteps() {
    return theRail?.steps.map((step) => {
      const live = step.mockupId === null ? undefined : ai.live[step.mockupId]
      const note = live
        ? (railNote(live, ai.writing[live.mockupId]) ?? railCarryNote(live.carry))
        : null
      return (
        <PileStep
          key={step.key}
          status={step.status}
          label={step.label}
          showConnector={step.showConnector}
          showNote={note !== null}
          {...(note !== null ? { note } : {})}
          onClick={() => void go((s) => jumpTo(s, step.step))}
        />
      )
    })
  }

  return (
    <>
      <FlowModal
        open
        step="look-over"
        count={headerBadge(flow)}
        progress={progress(flow)}
        onRequestClose={() => setAsking(true)}
        body={body}
      />
      <Lightbox
        open={zooming && cover !== undefined}
        mode="single"
        state={cover?.missing ? 'missing' : 'loaded'}
        caption={
          form
            ? fullTitle(
                form.title.trim() || item?.title || '',
                form.variation?.trim() ? { words: form.variation.trim() } : null
              )
            : ''
        }
        {...(cover?.path ? { src: coverUrl(cover.path) } : {})}
        onClose={() => setZooming(false)}
        onCheckLibrary={() => {
          setZooming(false)
          void checkLibrary()
        }}
      />
      <ConfirmDialog
        open={asking}
        variant="neutral"
        detail={false}
        working={busy}
        title="Finish later?"
        description="Everything you’ve done is saved, drafts included. You’ll pick up here from To stash."
        cancelLabel="Keep going"
        confirmLabel="Finish later"
        workingLabel="Saving…"
        onCancel={() => setAsking(false)}
        onConfirm={() => void finishLater()}
      />
    </>
  )
}
