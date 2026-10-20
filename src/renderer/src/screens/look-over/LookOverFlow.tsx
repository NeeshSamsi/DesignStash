import { useCallback, useEffect, useRef, useState } from 'react'
import type { LookOverItem, LookOverQueue } from '@shared/approval'
import { IPC_CHANNELS } from '@shared/ipc'
import { Button } from '@renderer/components/Button'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { CoverPanel } from '@renderer/components/CoverPanel'
import { ErrorState } from '@renderer/components/ErrorState'
import { FlowModal } from '@renderer/components/FlowModal'
import { MockupCard } from '@renderer/components/MockupCard'
import { MockupMetaForm } from '@renderer/components/MockupMetaForm'
import { PileRail } from '@renderer/components/PileRail'
import { PileStep } from '@renderer/components/PileStep'
import { Tooltip } from '@renderer/components/Tooltip'
import { useTagVocabulary } from '@renderer/hooks/use-tag-vocabulary'
import { toast, undoToast } from '@renderer/stores/toastStore'
import { Skeleton } from '@renderer/ui/skeleton'
import {
  afterStash,
  back,
  backTarget,
  canSkip,
  createFlow,
  currentItem,
  currentUnit,
  deck,
  finished,
  headerBadge,
  isPile,
  jumpTo,
  next,
  onReview,
  primary,
  rail,
  reviewCards,
  skip,
  type FlowState
} from './flow-model'
import { NO_COVER_REASON, NO_TITLE_REASON, doneMessage, stashRefusal } from './look-over-copy'

export interface LookOverFlowProps {
  open: boolean
  /** Finish later (confirmed), or all done. */
  onClose: () => void
  /** Back from the very first mockup, while nothing is stashed: the Sort board. Hidden without it. */
  onBackToSort?: () => void
}

interface Form {
  title: string
  description: string
  tags: LookOverItem['tags']
}

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

const formOf = (item: LookOverItem): Form => ({
  title: item.title,
  description: item.description,
  tags: item.tags
})
const tagIds = (form: Form) => form.tags.map((t) => t.tagId)
const sameForm = (a: Form, b: Form) =>
  a.title === b.title && a.description === b.description && tagIds(a).join() === tagIds(b).join()

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
  const { vocabulary, createTag } = useTagVocabulary()

  const unit = currentUnit(flow)
  const item = currentItem(flow)
  const review = onReview(flow)
  const form = item ? forms[item.mockupId] : undefined
  const cover = item ? covers[item.mockupId] : undefined
  const pile = isPile(unit)
  const model = primary(flow)
  const theDeck = deck(flow)
  const theRail = rail(flow)
  const blocked = item && form ? form.title.trim() === '' : false
  const noCover = item && cover ? panelSource(cover) === 'none' : false

  /** Saves the open mockup's draft when it changed or hasn't been recorded as looked at. */
  const saveCurrent = useCallback(async (): Promise<boolean> => {
    if (!item || !form) return true
    const unchanged = sameForm(form, saved.current[item.mockupId]!)
    if (unchanged && savedChecked.current.has(item.mockupId)) return true
    if (form.title.trim() === '') return false
    const res = await window.api
      .invoke(IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT, {
        mockupId: item.mockupId,
        title: form.title.trim(),
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
    if (res.data.propagatedIds.length > 0) {
      // The top mockup's edit carried over to variants that were not touched: show what they now hold.
      const fresh = await window.api
        .invoke(IPC_CHANNELS.LOOK_OVER_OPEN, undefined)
        .catch(() => null)
      if (fresh?.success) {
        const updated = fresh.data.units
          .flatMap((u) => u.items)
          .filter((i) => res.data.propagatedIds.includes(i.mockupId))
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
  }, [item, form])

  const go = async (move: (s: FlowState) => FlowState) => {
    if (!(await saveCurrent())) return
    setFlow(move)
  }

  const edit = (patch: Partial<Form>) => {
    if (!item || !form) return
    setForms((current) => ({ ...current, [item.mockupId]: { ...form, ...patch } }))
  }

  // -- Stash -----------------------------------------------------------------------------------

  const finish = (s: FlowState) => {
    if (finished(s)) {
      toast(doneMessage(stashedCount.current, 0), 'success')
      onClose()
    }
  }

  const undoStash = async (
    snapshot: Parameters<typeof window.api.invoke<'pile:unstash'>>[1]['snapshot'],
    unitId: number,
    count: number
  ) => {
    await window.api.invoke(IPC_CHANNELS.PILE_UNSTASH, { snapshot })
    stashedCount.current -= count
    const fresh = await window.api.invoke(IPC_CHANNELS.LOOK_OVER_OPEN, undefined).catch(() => null)
    if (!fresh?.success) return
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

  const footerPrimary = (
    <Tooltip label={blocked ? NO_TITLE_REASON : NO_COVER_REASON} arrow="bottom-right">
      <span tabIndex={blocked || noCover ? 0 : -1} className="inline-flex">
        <Button
          label={model.label}
          loading={busy}
          disabled={busy || (!review && (blocked || (noCover && model.kind !== 'next')))}
          onClick={primaryAction}
        />
      </span>
    </Tooltip>
  )

  const footer = (
    <div className="flex items-center gap-2 border-t border-subtle pt-4">
      {target && <Button variant="secondary" label="Back" onClick={() => void doBack()} />}
      {canSkip(flow) && (
        <Button variant="ghost" label="Skip for now" onClick={() => void doSkip()} />
      )}
      <div className="flex-1" />
      <Button variant="secondary" label="Finish later" onClick={() => setAsking(true)} />
      {footerPrimary}
    </div>
  )

  const cards = reviewCards(flow)
  const body = review ? (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="grid min-h-0 flex-1 grid-cols-4 content-start gap-4 overflow-y-auto">
          {unit.items.map((it, step) => {
            const note = cards.find((c) => c.mockupId === it.mockupId)?.note ?? null
            const c = covers[it.mockupId]
            return (
              <MockupCard
                key={it.mockupId}
                variant="pending-review"
                mockupId={String(it.mockupId)}
                title={forms[it.mockupId]?.title ?? it.title}
                tags={note ?? forms[it.mockupId]?.tags.map((t) => t.label).join(' · ') ?? ''}
                variantCount={0}
                favourite={false}
                {...(c?.path ? { coverSrc: `file://${c.path}` } : {})}
                onClick={() => void go((s) => jumpTo(s, step))}
                onLookItOver={() => void go((s) => jumpTo(s, step))}
              />
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
            sidecarAccepted
            showDeck={theDeck.showDeck}
            deckMore={theDeck.deckMore}
            deckLabel={theDeck.label}
            {...(cover.path ? { coverSrc: `file://${cover.path}` } : {})}
            {...(cover.width && cover.height
              ? { imageSize: { width: cover.width, height: cover.height } }
              : {})}
            onCover={replaceCover}
            onUsePsdPreview={useEmbedded}
          />
        )}
        <div className="min-w-0 flex-1">
          {form && (
            <MockupMetaForm
              variant="approval"
              state={blocked ? 'invalid' : 'pristine'}
              showHint={false}
              title={form.title}
              onTitleChange={(title) => edit({ title })}
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
    return theRail?.steps.map((step) => (
      <PileStep
        key={step.key}
        status={step.status}
        label={step.label}
        showConnector={step.showConnector}
        onClick={() => void go((s) => jumpTo(s, step.step))}
      />
    ))
  }

  return (
    <>
      <FlowModal
        open
        step="look-over"
        count={headerBadge(flow)}
        onRequestClose={() => setAsking(true)}
        body={body}
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
