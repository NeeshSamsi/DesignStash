import { mockups, pluralise } from '@renderer/lib/plural'

/** Plain words for the stash check's toasts. Names and counts only, never a path or a code. */
export const stashCheckCopy = {
  couldNotCheck: {
    message: 'Couldn’t check your stash folder',
    description: 'Open Settings › My Stash to try again.',
    action: 'Open Settings'
  },
  couldNotLoad: 'Couldn’t check your stash. Try again.',
  inSync: 'Your stash is in sync',
  added: (n: number) => `Added ${pluralise(n, 'file')} to To sort`,
  removed: (n: number) => `Removed ${mockups(n)}`,
  ignored: (n: number) => `Ignored ${pluralise(n, 'change')}`,
  couldNotAdd: 'Couldn’t add those. Try again.',
  couldNotRemove: 'Couldn’t remove those. Try again.',
  couldNotIgnore: 'Couldn’t ignore those. Try again.',
  couldNotUndo: 'Couldn’t undo that. Try again.',
  relink: {
    'not-psd': 'That isn’t a PSD. Pick a PSD file.',
    'already-in-stash': 'That PSD is already in your stash.',
    failed: 'Couldn’t relink that. Try again.'
  },
  relinked: 'Relinked'
} as const
