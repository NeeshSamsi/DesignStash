import type { LookOverItem, LookOverQueue, LookOverUnit } from '@shared/approval'

/**
 * The pure model of Look it over (design/specs/piles.md): where you are, what Back and Next do,
 * the header badge, the deck, the rail's step statuses, the review step and Skip.
 * Everything in a pile is a draft until Stash pile, so nothing here talks to main: the screen
 * saves drafts and stashes, then tells the model what happened.
 */

/** Where you are. `step` is an item index in the unit; for a pile, `step === items.length` is its review. */
interface Position {
  unit: number
  step: number
}

export interface FlowState {
  /** Piles first, then mockups on their own. Skip reorders the singles. */
  units: readonly LookOverUnit[]
  position: Position
  /** Mockups the person has looked at: opened or saved. Seeded from the drafts. */
  checked: ReadonlySet<number>
  /** Mockups jumped past (via the rail or Review pile) without opening. */
  skipped: ReadonlySet<number>
  /** Units stashed in this session. Back reopens them editable. */
  stashed: ReadonlySet<number>
}

export const isPile = (unit: LookOverUnit) => unit.kind === 'pile'

/** Steps in a unit: every item, then a pile's review. */
const stepCount = (unit: LookOverUnit) => unit.items.length + (isPile(unit) ? 1 : 0)
const isReview = (unit: LookOverUnit, step: number) =>
  isPile(unit) && step === unit.items.length

/** A fresh flow from the queue main sent, resuming where Finish later left off. */
export function createFlow(queue: LookOverQueue): FlowState {
  const units = queue.units
  let position: Position = { unit: 0, step: 0 }
  if (queue.resume) {
    const unit = units.findIndex((u) => u.unitId === queue.resume!.unitId)
    const step =
      unit === -1 ? -1 : units[unit]!.items.findIndex((i) => i.mockupId === queue.resume!.mockupId)
    if (unit !== -1 && step !== -1) position = { unit, step }
  }
  const checked = new Set(
    units.flatMap((u) => u.items.filter((i) => i.checked).map((i) => i.mockupId))
  )
  return { units, position, checked, skipped: new Set(), stashed: new Set() }
}

export const currentUnit = (s: FlowState) => s.units[s.position.unit]!
export const currentItem = (s: FlowState): LookOverItem | null => {
  const unit = currentUnit(s)
  return unit.items[s.position.step] ?? null
}
export const onReview = (s: FlowState) => isReview(currentUnit(s), s.position.step)

const withChecked = (s: FlowState, mockupId: number | undefined): ReadonlySet<number> =>
  mockupId === undefined || s.checked.has(mockupId) ? s.checked : new Set([...s.checked, mockupId])

/** Opening or leaving a mockup counts as having looked at it. */
function leave(s: FlowState): FlowState {
  const item = currentItem(s)
  if (!item) return s
  const skipped = new Set(s.skipped)
  skipped.delete(item.mockupId)
  return { ...s, checked: withChecked(s, item.mockupId), skipped }
}

/** Open a step. Opening it marks it looked at, and un-skips it. */
function open(s: FlowState, position: Position): FlowState {
  const unit = s.units[position.unit]!
  const item = unit.items[position.step]
  const skipped = new Set(s.skipped)
  if (item) skipped.delete(item.mockupId)
  return { ...s, position, checked: withChecked(s, item?.mockupId), skipped }
}

// -- Next, jump, stash ----------------------------------------------------------------------

/** Next goes on in order: top, variants, then Review & stash pile. A single has no next within itself. */
export function next(s: FlowState): FlowState {
  const unit = currentUnit(s)
  const { step } = s.position
  if (step >= stepCount(unit) - 1) return s
  return open(leave(s), { unit: s.position.unit, step: step + 1 })
}

/**
 * Any step in the rail jumps there. Mockups jumped past without being opened become "skipped",
 * and Review pile (the last step) is the same jump.
 */
export function jumpTo(s: FlowState, step: number): FlowState {
  const unit = currentUnit(s)
  if (step < 0 || step >= stepCount(unit) || step === s.position.step) return s
  const from = leave(s)
  const skipped = new Set(from.skipped)
  if (step > s.position.step) {
    for (const item of unit.items.slice(s.position.step + 1, step)) {
      if (!from.checked.has(item.mockupId)) skipped.add(item.mockupId)
    }
  }
  return open({ ...from, skipped }, { unit: s.position.unit, step })
}

/** After Stash pile (or Stash on a single): the next unit starts on its first mockup. */
export function afterStash(s: FlowState): FlowState {
  const unit = currentUnit(s)
  const stashed = new Set([...s.stashed, unit.unitId])
  const checked = new Set([...s.checked, ...unit.items.map((i) => i.mockupId)])
  const base = { ...s, stashed, checked }
  const following = s.position.unit + 1
  if (following >= s.units.length) return base
  return open(base, { unit: following, step: 0 })
}

/** True once every unit is stashed: Tucked away. */
export const finished = (s: FlowState) => s.units.every((u) => s.stashed.has(u.unitId))

// -- Back -----------------------------------------------------------------------------------

export type BackTarget =
  | { kind: 'position'; position: Position; /** "Pile 1 of 3 · stashed". */ stashed: boolean }
  | { kind: 'sort' }

/**
 * Back always means "the previous thing" (piles.md). Null hides the button: the very first mockup,
 * once anything is stashed.
 */
export function backTarget(s: FlowState): BackTarget | null {
  const { unit: u, step } = s.position
  const unit = currentUnit(s)
  // A draft inside a pile (or its review): the previous draft, the same as the step above in the rail.
  if (isPile(unit) && step > 0) {
    return { kind: 'position', position: { unit: u, step: step - 1 }, stashed: false }
  }
  if (u > 0) {
    const previous = s.units[u - 1]!
    // A pile's top mockup: the previous pile's review. A single: the previous single, or the last pile's review.
    const position = isPile(previous)
      ? { unit: u - 1, step: previous.items.length }
      : { unit: u - 1, step: 0 }
    return { kind: 'position', position, stashed: s.stashed.has(previous.unitId) }
  }
  // The very first mockup: the Sort board, only while nothing is stashed.
  return s.stashed.size === 0 ? { kind: 'sort' } : null
}

export function back(s: FlowState): FlowState {
  const target = backTarget(s)
  if (!target || target.kind === 'sort') return s
  return open(leave(s), target.position)
}

// -- Header, deck, rail, primary ------------------------------------------------------------

const piles = (s: FlowState) => s.units.filter(isPile)
const mockupTotal = (s: FlowState) => s.units.reduce((n, u) => n + u.items.length, 0)

/**
 * The header badge: "Pile n of m" in piles, "Pile n of m · review" on the review step, "Pile n of m · stashed"
 * when Back reopened a stashed pile, and the plain haul count ("11 of 12") on mockups on their own.
 */
export function headerBadge(s: FlowState): string {
  const unit = currentUnit(s)
  if (isPile(unit)) {
    const n = piles(s).findIndex((p) => p.unitId === unit.unitId) + 1
    const base = `Pile ${n} of ${piles(s).length}`
    if (s.stashed.has(unit.unitId)) return `${base} · stashed`
    return onReview(s) ? `${base} · review` : base
  }
  const before = s.units.slice(0, s.position.unit).reduce((n, u) => n + u.items.length, 0)
  return `${before + 1} of ${mockupTotal(s)}`
}

export interface Deck {
  /** Mockups not looked at yet, after this one. */
  remaining: number
  /** One card peeks when any are left. */
  showDeck: boolean
  /** A second card peeks when two or more are. */
  deckMore: boolean
  label: string
}

/** The deck thins as you go, counts only what you haven't looked at, and is gone on the last one. */
export function deck(s: FlowState): Deck {
  const unit = currentUnit(s)
  const remaining = onReview(s)
    ? 0
    : unit.items.slice(s.position.step + 1).filter((i) => !s.checked.has(i.mockupId)).length
  return {
    remaining,
    showDeck: remaining >= 1,
    deckMore: remaining >= 2,
    label: `${remaining} left in this pile`
  }
}

type StepStatus = 'done' | 'current' | 'todo' | 'skipped'

interface RailStep {
  key: string
  /** Null for the review step. */
  mockupId: number | null
  label: string
  status: StepStatus
  showConnector: boolean
  /** The step index to jump to. */
  step: number
}

export interface Rail {
  /** "PILE 1 OF 3". */
  pile: string
  title: string
  steps: RailStep[]
}

/**
 * The rail for the current pile: the top mockup, the variants, then Review & stash pile. Null for a
 * single. `titles` are the drafts as edited (by mockup id), so the labels follow the typing; a
 * blank draft keeps the title the mockup opened with.
 */
export function rail(s: FlowState, titles: Readonly<Record<number, string>> = {}): Rail | null {
  const unit = currentUnit(s)
  if (!isPile(unit)) return null
  const n = piles(s).findIndex((p) => p.unitId === unit.unitId) + 1
  const statusOf = (mockupId: number, step: number): StepStatus =>
    step === s.position.step
      ? 'current'
      : s.checked.has(mockupId)
        ? 'done'
        : s.skipped.has(mockupId)
          ? 'skipped'
          : 'todo'
  const titleOf = (item: LookOverItem) => titles[item.mockupId]?.trim() || item.title
  const steps: RailStep[] = unit.items.map((item, step) => ({
    key: String(item.mockupId),
    mockupId: item.mockupId,
    label:
      item.role === 'top' ? `Top · ${titleOf(item)}` : `Variant · ${titleOf(item)} · ${step}`,
    status: statusOf(item.mockupId, step),
    showConnector: true,
    step
  }))
  steps.push({
    key: 'review',
    mockupId: null,
    label: 'Review & stash pile',
    status: onReview(s) ? 'current' : 'todo',
    showConnector: false,
    step: unit.items.length
  })
  return { pile: `PILE ${n} OF ${piles(s).length}`, title: titleOf(unit.items[0]!), steps }
}

export interface ReviewCard {
  mockupId: number
  /** "Not checked · pre-filled from the top mockup". They are still stashable. */
  note: string | null
}

export const NOT_CHECKED = 'Not checked · pre-filled from the top mockup'

/** The pile's drafts as library cards. Clicking one goes back to that draft. */
export function reviewCards(s: FlowState): ReviewCard[] {
  return currentUnit(s).items.map((item) => ({
    mockupId: item.mockupId,
    note: s.checked.has(item.mockupId) ? null : NOT_CHECKED
  }))
}

export type PrimaryKind = 'next' | 'stash-pile' | 'stash' | 'save-next'

/**
 * The one primary button: Next in a pile, Stash pile (N) on its review, Stash & next on a single.
 * Once a pile or single is stashed (Back reopened it) the label is Save & next, or Save on the last unit.
 */
export function primary(s: FlowState): { kind: PrimaryKind; label: string } {
  const unit = currentUnit(s)
  const last = s.position.unit === s.units.length - 1
  const saved = s.stashed.has(unit.unitId)
  if (isPile(unit)) {
    if (!onReview(s)) return { kind: 'next', label: 'Next' }
    return {
      kind: 'stash-pile',
      label: saved ? (last ? 'Save' : 'Save & next') : `Stash pile (${unit.items.length})`
    }
  }
  if (saved) return { kind: 'save-next', label: last ? 'Save' : 'Save & next' }
  return { kind: 'stash', label: last ? 'Stash' : 'Stash & next' }
}

// -- Skip -----------------------------------------------------------------------------------

/**
 * Skip for now exists only for a mockup on its own that is not stashed yet (Back can reopen a
 * stashed one), and needs another one waiting after it.
 */
export function canSkip(s: FlowState): boolean {
  const unit = currentUnit(s)
  if (isPile(unit) || s.stashed.has(unit.unitId)) return false
  return s.units.slice(s.position.unit + 1).some((u) => !isPile(u) && !s.stashed.has(u.unitId))
}

/** Sends the mockup to the end of the queue; the next one takes its place. It counts as looked at. */
export function skip(s: FlowState): FlowState {
  if (!canSkip(s)) return s
  const unit = currentUnit(s)
  const left = leave(s)
  const units = [...s.units.slice(0, s.position.unit), ...s.units.slice(s.position.unit + 1), unit]
  return open({ ...left, units }, { unit: s.position.unit, step: 0 })
}

// -- Progress -------------------------------------------------------------------------------

/**
 * How far through the haul, 0 to 1, for the FlowModal's last track. Counts the mockups looked at
 * (opened, left or skipped past), everything in a stashed pile, and the one on screen, so it moves
 * on Next, Stash and Skip and never goes back.
 */
export function progress(s: FlowState): number {
  const total = mockupTotal(s)
  if (total === 0) return 0
  const seen = new Set(s.checked)
  for (const unit of s.units) {
    if (s.stashed.has(unit.unitId)) for (const item of unit.items) seen.add(item.mockupId)
  }
  const here = currentItem(s)
  if (here) seen.add(here.mockupId)
  return Math.min(1, seen.size / total)
}

/** What the form shows for one mockup. */
export interface DraftForm {
  title: string
  description: string
  tags: LookOverItem['tags']
}

export const formOf = (item: LookOverItem): DraftForm => ({
  title: item.title,
  description: item.description,
  tags: item.tags
})

const tagKey = (form: DraftForm) => form.tags.map((t) => t.tagId).join()

/**
 * A draft main filled in after the flow opened (a late AI suggestion). Each field the user hasn't
 * changed since the last save takes main's value; one they are editing keeps their words. `saved`
 * becomes what main now holds, so the next save counts only their edits.
 */
export function landedDraft(
  form: DraftForm,
  saved: DraftForm,
  item: LookOverItem
): { form: DraftForm; saved: DraftForm } {
  const fresh = formOf(item)
  return {
    form: {
      title: form.title === saved.title ? fresh.title : form.title,
      description: form.description === saved.description ? fresh.description : form.description,
      tags: tagKey(form) === tagKey(saved) ? fresh.tags : form.tags
    },
    saved: fresh
  }
}
