import type { LookOverItem } from '@shared/approval'
import type { AiStatusUpdate } from '@shared/ipc/ai-status'
import type { AiStatusKind } from '@renderer/components/AiStatus'
import type { MetaField } from '@renderer/components/MockupMetaForm'
import { WRITING_PLACEHOLDER } from '@renderer/lib/writing-field'

/**
 * The AI writing a mockup's suggestion in Look it over (design/specs/look-over.md, L6): which
 * fields still say "Writing with AI…", what the status line says, when "taking a while" shows,
 * the rail's notes and whether Stash pile waits. Pure: the screen keeps a `Writing` per mockup
 * from `look-over:showing`, `ai:status` and what the person does, and asks these.
 */

/** What the renderer has learned about one mockup's suggestion since Look it over opened. */
export interface Writing {
  /** Main's last word on its run: the `look-over:showing` answer or an `ai:status` push. */
  ai?: AiStatusUpdate
  /** Fields the person typed in while the AI wrote: theirs from then on (L6.2). */
  typed?: readonly MetaField[]
  /** Fill it myself (L6.E1): the whole mockup is theirs. */
  optedOut?: boolean
  /** When it first came on screen (epoch ms): the slow clock while it waits its turn. */
  shownAt?: number
  /** The fields the AI just filled, and when (L6.3). */
  landed?: { fields: readonly MetaField[]; at: number }
}

export type LineAction = 'fill-myself' | 'write-suggestions' | 'try-again'

export interface AiLine {
  kind: Exclude<AiStatusKind, 'none'>
  message: string
  action?: LineAction
}

export const FIELDS: readonly MetaField[] = ['title', 'description', 'tags']

/** How long the line says what landed before its text fades (L6.3). */
export const LANDED_FOR_MS = 4000

export const QUEUED_NOTE = 'Suggestions on the way'
const SLOW = 'Still writing with AI. This one is taking a while.'

/** Still waiting for the AI, and not opted out, failed or switched off. Tops and singles included. */
export const isWriting = (item: LookOverItem, w: Writing = {}): boolean =>
  item.waitingForAi && !w.optedOut && w.ai?.status !== 'failed' && w.ai?.status !== 'off'

/** The fields that still say "Writing with AI…": all of them, less the ones the person typed in. */
export const writingFields = (item: LookOverItem, w: Writing = {}): MetaField[] =>
  isWriting(item, w) ? FIELDS.filter((f) => !(w.typed ?? []).includes(f)) : []

/** The AI couldn't write this one (L6.E3): its run failed, and the person hasn't taken it over. */
export const couldNotWrite = (w: Writing = {}): boolean => !w.optedOut && w.ai?.status === 'failed'

/**
 * When the run counts as slow (epoch ms): from when the model began on this mockup, or from when
 * it came on screen while it waits its turn. A model load doesn't count, so `starting` has no clock.
 */
export function slowAt(w: Writing = {}): number | null {
  const run = w.ai?.run
  if (!run) return null
  if (run.phase === 'writing' && run.writingSince !== null)
    return run.writingSince + run.slowAfterMs
  if (run.phase === 'queued' && w.shownAt !== undefined) return w.shownAt + run.slowAfterMs
  return null
}

/** "title", "description and tags", "title, description and tags". */
function list(fields: readonly MetaField[]): string {
  if (fields.length <= 1) return fields.join('')
  return `${fields.slice(0, -1).join(', ')} and ${fields[fields.length - 1]}`
}

/** "Your title stays as you typed it.", "Your tags stay as you set them." */
function yours(typed: readonly MetaField[]): string {
  const one = typed.length === 1 && typed[0] !== 'tags'
  const verb = typed.includes('tags') ? 'set' : 'typed'
  return `Your ${list(typed)} ${one ? 'stays' : 'stay'} as you ${verb} ${one ? 'it' : 'them'}.`
}

const ordered = (fields: readonly MetaField[]) => FIELDS.filter((f) => fields.includes(f))

/** What the status line says for this mockup now, or null when there is nothing to say. */
export function aiLine(item: LookOverItem, w: Writing = {}, now: number): AiLine | null {
  const typed = ordered(w.typed ?? [])
  if (isWriting(item, w)) {
    const slow = slowAt(w)
    if (slow !== null && now >= slow)
      return { kind: 'working', message: SLOW, action: 'fill-myself' }
    const left = writingFields(item, w)
    const message =
      typed.length === 0
        ? WRITING_PLACEHOLDER
        : `Writing the ${list(left)} with AI. ${yours(typed)}`
    return { kind: 'working', message, action: 'fill-myself' }
  }
  const fromFileName = !typed.includes('title')
  if (w.optedOut) {
    return {
      kind: 'off',
      message: `You’re filling this one in.${fromFileName ? ' Its title starts from the file name.' : ''}`,
      action: 'write-suggestions'
    }
  }
  if (couldNotWrite(w)) {
    return {
      kind: 'failed',
      message: `Couldn’t write suggestions for this one${fromFileName ? ', so the title is its file name' : ''}.`,
      action: 'try-again'
    }
  }
  if (w.landed && w.landed.fields.length > 0 && now < w.landed.at + LANDED_FOR_MS) {
    const filled = `AI filled in the ${list(ordered(w.landed.fields))}.`
    return { kind: 'done', message: typed.length > 0 ? `${filled} ${yours(typed)}` : filled }
  }
  return null
}

/** The row is decided when the mockup opens: it gets one when it opens with something to say. */
export const opensWithRow = (item: LookOverItem, w: Writing = {}, now: number): boolean =>
  aiLine(item, w, now) !== null

/** When the line next changes without anyone doing anything: the slow threshold, or the end of "filled in". */
export function nextLineChange(item: LookOverItem, w: Writing = {}, now: number): number | null {
  if (isWriting(item, w)) {
    const slow = slowAt(w)
    return slow !== null && slow > now ? slow : null
  }
  const ends = w.landed ? w.landed.at + LANDED_FOR_MS : null
  return ends !== null && ends > now ? ends : null
}

/** The rail's note on a step still waiting for the AI (PileStep `note`). */
export function railNote(item: LookOverItem, w: Writing = {}): string | null {
  if (!isWriting(item, w)) return null
  return w.ai?.status === 'sniffing' ? WRITING_PLACEHOLDER : QUEUED_NOTE
}

/**
 * Why Stash pile waits (L6.E4): it waits until every mockup's suggestions have landed or been
 * filled in by hand. Null when nothing holds it up. `titles` are the drafts' titles by mockup id.
 */
export function stashWait(
  items: readonly LookOverItem[],
  writing: Readonly<Record<number, Writing>>,
  titles: Readonly<Record<number, string>>
): string | null {
  const waiting = items.filter((i) => isWriting(i, writing[i.mockupId]))
  if (waiting.length === 0) return null
  const whose =
    waiting.length === 1
      ? `${titles[waiting[0]!.mockupId] ?? waiting[0]!.title}’s`
      : `${waiting.length} mockups’`
  return `Stash pile waits until ${whose} suggestions arrive.`
}
