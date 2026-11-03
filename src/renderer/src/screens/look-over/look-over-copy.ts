import { mockups } from '@renderer/lib/plural'

/**
 * The toast when Look it over ends (inboxes.md, Done). All stashed: "All tucked away · N mockups
 * stashed". Finish later with some still waiting: "N tucked away · M skipped ones are waiting in
 * To stash."
 */
export function doneMessage(stashed: number, waiting: number): string {
  if (waiting === 0) return `All tucked away · ${mockups(stashed)} stashed`
  return `${stashed} tucked away · ${waiting} skipped ${waiting === 1 ? 'one is' : 'ones are'} waiting in To stash.`
}

/** Why Stash pile was refused, in plain words. */
export function stashRefusal(reason: 'not-ready' | 'no-cover'): {
  title: string
  description: string
} {
  return reason === 'no-cover'
    ? {
        title: 'Add a cover to stash it',
        description: 'A mockup in this pile has no cover yet. Add one, then stash again.'
      }
    : {
        title: 'A draft isn’t ready yet',
        description: 'Give every mockup in the pile a title, then stash again.'
      }
}

export const NO_COVER_REASON = 'Add a cover to stash it'
/** Look it over opened on nothing: everything it would show was stashed or tossed meanwhile (S10.E4). */
export const NOTHING_LEFT = 'Nothing left to look over'
export const NO_TITLE_REASON = 'Add a title to continue'
/** Where Skip for now sends a mockup: nowhere new, it just goes to the end of the queue. */
export const SKIP_NOTE = 'It stays in To stash'
