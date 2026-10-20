import type { AiDownloadFailure } from '@shared/ipc/ai'

/** "/Users/ada/Pictures/DesignStash" → "~/Pictures/DesignStash". Anything outside the home folder is left alone. */
export function friendlyPath(path: string): string {
  const home = /^\/Users\/[^/]+/.exec(path)
  if (!home) return path
  const rest = path.slice(home[0].length)
  return rest === '' ? '~' : `~${rest}`
}

/** Where a folder lives, in words: "Macintosh HD › Users › you › Pictures". */
export function locationTrail(path: string): string {
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  if (parts[0] === 'Volumes' && parts[1]) {
    return [parts[1], ...parts.slice(2)].join(' › ')
  }
  const named = parts.map((part, index) => (parts[index - 1] === 'Users' ? 'you' : part))
  return ['Macintosh HD', ...named].join(' › ')
}

export const WELCOME = {
  title: 'Welcome to DesignStash',
  body: 'Keep all your mockup PSDs in one place and find them by what’s in them. Everything stays on your Mac.'
} as const

export const STASH_STEP = {
  title: 'Where should your stash live?',
  body: 'We’ll copy your PSDs here and keep their covers and tags right next to them.'
} as const

export const PRIVACY_STEP = {
  title: 'Your privacy',
  body: 'Here’s exactly what we share to help squash bugs, and what we never touch.'
} as const

export const DONE_STEP = {
  title: 'Your stash is ready!',
  body: 'Hit “Add a mockup” in the sidebar to bring in files or a folder, or just drop PSDs anywhere in the window.'
} as const

export const AI_STEP = {
  title: 'Set up on-device AI',
  body: 'A small AI model writes titles and tags for your new mockups. It runs right here on your Mac, so nothing gets uploaded.'
} as const

/** What the stash-folder check found, as the line under the field. */
export function folderHint(state: 'missing' | 'not-writable'): string {
  return state === 'missing'
    ? 'We can’t find that folder. Mind picking another one?'
    : 'We can’t stash anything in this folder. Mind picking another one?'
}

/** The download failure as the row's reason. Reuses the settings wording. */
export type { AiDownloadFailure }
