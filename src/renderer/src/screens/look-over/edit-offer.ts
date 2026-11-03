import type { ApprovalTag, LookOverCarry } from '@shared/approval'
import type { AiLine } from './ai-writing'
import { wordDiff, type WordDiff } from './word-diff'

/**
 * An edit to a pile's top reaching a variant (design/specs/look-over.md, L7): what the status line
 * says for each `carry` state and `why`, L7.1's heads-up on the top, the rail's and the review
 * cards' notes, and what the preview shows. Pure; the screen answers with `look-over:answer-edit`.
 */

export type OfferAction = 'apply-here' | 'apply-anyway' | 'undo'

export interface OfferLine {
  kind: AiLine['kind']
  message: string
  action?: OfferAction
  /** The ×: dismiss the offer for this variant only (⌘Z brings it back). */
  dismissible?: true
}

const variants = (n: number) => (n === 1 ? 'the variant' : `the ${n} variants`)

const OFFERED: Record<NonNullable<LookOverCarry['why']>, Omit<OfferLine, 'dismissible'>> = {
  unjudged: { kind: 'off', message: 'Use your top mockup edits here too?', action: 'apply-here' },
  refused: { kind: 'off', message: 'Left out your top mockup edits.', action: 'apply-anyway' },
  slow: {
    kind: 'off',
    message: 'The check is slow, so your top mockup edits are offered here.',
    action: 'apply-here'
  },
  failed: {
    kind: 'failed',
    message: 'Couldn’t check your edits, so they’re offered here instead.',
    action: 'apply-here'
  },
  undone: {
    kind: 'off',
    message: 'Back to this one’s own words. Your top mockup edits stay on offer.',
    action: 'apply-here'
  }
}

/**
 * The line for a variant the top's edit reached. `reached` is how many variants in the pile it
 * reached; `acceptedHere` is true once the person applied it on this one in this session (L7.8).
 */
export function offerLine(
  carry: LookOverCarry | null,
  { reached, acceptedHere }: { reached: number; acceptedHere: boolean }
): OfferLine | null {
  if (!carry) return null
  switch (carry.state) {
    case 'checking':
      return {
        kind: 'working',
        message: `Checking how your edits to the top mockup fit ${variants(reached)}…`
      }
    case 'applied':
      return {
        kind: 'done',
        message: acceptedHere
          ? 'Applied your top mockup edits to this one.'
          : 'Worked your top mockup edits into this one’s own words.',
        action: 'undo'
      }
    case 'reworded':
      return { kind: 'done', message: 'Your edits were reworded for this one.', action: 'undo' }
    case 'offered':
      return { ...OFFERED[carry.why ?? 'unjudged'], dismissible: true }
    case 'dismissed':
      return null
  }
}

/** L7.1 on the top: once its description or tags changed, what Next will do to the untouched variants. */
export function headsUp({
  edited,
  untouched,
  checksEdits
}: {
  edited: boolean
  untouched: number
  checksEdits: boolean
}): OfferLine | null {
  if (!edited || untouched === 0) return null
  return {
    kind: 'done',
    message: checksEdits
      ? `When you go on, your edits get checked against ${variants(untouched)}.`
      : `When you go on, your edits are offered on ${variants(untouched)}.`
  }
}

/** The rail's note on a variant the edit reached. A dismissed offer leaves none. */
export function railCarryNote(carry: LookOverCarry | null): string | null {
  switch (carry?.state) {
    case 'checking':
      return 'Checking your edits…'
    case 'applied':
      return 'Edits applied'
    case 'reworded':
      return 'Edits reworded'
    case 'offered':
      return 'Edits offered'
    default:
      return null
  }
}

/** A review card's line (L7.6, L7.11). A dismissed offer shows the card's own tags. */
export function cardNote(carry: LookOverCarry | null): string | null {
  switch (carry?.state) {
    case 'checking':
      return 'Checking your edits…'
    case 'applied':
      return 'Edits applied'
    case 'reworded':
      return 'Edits reworded for this one'
    case 'offered':
      return 'Edits offered: open it to apply'
    default:
      return null
  }
}

export interface OfferPreview {
  /** The header's line under "Your top mockup edits", or none. */
  description: string | null
  /**
   * The description change: preparing while the version is made, else the diff (null when the edit
   * leaves the description alone), `copied` when it is the top's words because the rewrite failed.
   */
  body: { kind: 'preparing' } | { kind: 'diff'; diff: WordDiff | null; copied: boolean }
  adds: ApprovalTag[]
  removes: ApprovalTag[]
  applyLabel: 'Apply here' | 'Apply anyway'
}

const NOT_CHECKED = 'Not checked for this variant, so look before you apply.'

/** "this one is on a white backdrop" as a sentence. */
const sentence = (reason: string) => {
  const s = reason.trim()
  const capital = s.charAt(0).toUpperCase() + s.slice(1)
  return /[.!?]$/.test(capital) ? capital : `${capital}.`
}

/** What the preview shows for an offer on a variant whose own description is `own`. */
export function offerPreview(
  carry: LookOverCarry,
  own: string,
  checksEdits: boolean
): OfferPreview {
  const why = carry.why ?? 'unjudged'
  const description =
    why === 'refused' && carry.reason
      ? sentence(carry.reason)
      : why === 'undone' && checksEdits
        ? null
        : NOT_CHECKED
  const after = carry.after
  return {
    description,
    body: after
      ? {
          kind: 'diff',
          diff: after.description === own ? null : wordDiff(own, after.description),
          copied: after.via === 'copy'
        }
      : { kind: 'preparing' },
    adds: carry.tagsAdded,
    removes: carry.tagsRemoved,
    applyLabel: why === 'refused' ? 'Apply anyway' : 'Apply here'
  }
}
